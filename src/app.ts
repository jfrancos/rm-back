import assert from "assert";
import bodyParser from "body-parser";
import changeCase from "change-case";
import "colors";
import connectMongo from "connect-mongo";
import dotenv from "dotenv";
import express, { Application, NextFunction, Request, Response } from "express";
import expressSession from "express-session";
import helmet from "helmet";
import * as http from "http";
import plainJoi from "joi";
import joiZxcvbn from "joi-zxcvbn";
import sodium from "libsodium-wrappers-sumo";
import Mailgun from "mailgun-js";
import mongodb from "mongodb";
import Stripe, { customers, ICard, IStripeError, subscriptions } from "stripe";
import zxcvbn from "zxcvbn";

// const fs = require ('fs');
// var diff = require("deep-diff").diff;

dotenv.config();
type Customer = customers.ICustomer;
type Subscription = subscriptions.ISubscription;
const MongoStore = connectMongo(expressSession);

// process.on('uncaughtException', (err) => {
//   fs.writeSync(1, `Caught exception: ${err}\n`);
// });

const joi = plainJoi.extend(joiZxcvbn());

declare module "express" {
    interface Request {
        user?: { [key: string]: any };
        value?: { [key: string]: any };
    }
}

// Mailgun Init
const domain = "mg.rhythmandala.com";
const apiKey = process.env.MG_KEY;
const mailgun = new Mailgun({ apiKey, domain });
const emailBody1 = `<p>Dear Rhythm Aficionado,
    <p>Thank you for subscribing to RhythMandala! Our goal is to make complex \
rhythmic structures from all across the globe simple, accessible and playable \
so that everyone can enjoy the benefits of understanding and experiencing \
rhythm in the body. If you have any questions, please email ryan@tapgym.com.
    <p>Go ahead and <a href='https://app.rhythmandala.com?`;
const emailBody2 = `'>click this link to complete your registration</a> and \
have fun!`;

// Stripe Init
const stripe = new Stripe(process.env.STRIPE_KEY);
const plan = process.env.STRIPE_PLAN;

// Mongo Init
let secret: string;
let mongoClient: mongodb.MongoClient;
let users: mongodb.Collection;
let secrets: mongodb.Collection;
const mongodbUri = process.env.MONGODB_URI;
const mongoInit = async () => {
    mongoClient = await mongodb.connect(
        mongodbUri,
        { useNewUrlParser: true }
    );
    users = await mongoClient.db().collection("users");
    secrets = await mongoClient.db().collection("secrets");
    try {
        console.log("creating index");
        await users.createIndex({ email: 1 }, { unique: true });
    } catch (err) {
        console.log(err);
    }
    if ((await secrets.countDocuments()) === 0) {
        await secrets.insertOne({
            secret: toBase64(sodium.crypto_auth_keygen())
        });
    }
    secret = (await secrets.findOne({})).secret;
};

// Express Init
const app = express();
const port = process.env.PORT;
let expressServer: http.Server;
app.use(helmet());
app.use(bodyParser.json());
const sessionStore = new MongoStore({ url: mongodbUri });

// Start DB then Express then Mocha callback
(async () => {
    await sodium.ready; // mongoInit depends on sodium being ready
    await mongoInit();
    const resave = false;
    const saveUninitialized = false;
    const store = sessionStore;
    const session = expressSession({
        resave,
        saveUninitialized,
        secret,
        store
    });
    app.post("/new-session/*", session, validate);
    app.post("/new-session/login", handleLogin);
    app.post("/new-session/confirm_email", handleConfirmEmail);
    app.post("/session/*", session, validate, getUser);
    app.post("/session/get_user", handleGetUser);
    app.post("/session/logout", handleLogout);
    app.post("/signup", validate, handleSignup);
    app.post("/stripe", handleStripeWebhook);
    // app.post("/session/update-source", handleUpdateSource);
    app.post("/session/purchase_five_pack", handlePurchase5Pack);
    // app.post("/session/cancel-subscription", handleCancelSubscription);
    // app.post("/session/update-shapes", handleUpdateShapes);
    // app.post("/session/get-pdf", handleGetPdf);
    // app.post("/resend-conf-email", handleResendConfEmail);
    // app.post("/reset-password", handleResetPassword);

    expressServer = await app.listen(port);
    if (mochaCallback) {
        mochaCallback();
    }
})();

const getUser = async (req: Request, res: Response, next: NextFunction) => {
    const user = await users.findOne({ email: req.session.email });
    if (!user) {
        res.sendStatus(401);
        return; // how would we even get here?
    }
    req.user = user;
    next();
};

const validate = async (req: Request, res: Response, next: NextFunction) => {
    const split = req.url.lastIndexOf("/");
    const schemaString = changeCase.camelCase(req.url.slice(split)) + "Schema";
    const schema = schemas[schemaString] || joi.object().keys({});
    const validation = schema.validate(req.body);
    if (validation.error) {
        handleError(req, res, validation.error.name, validation.error.message);
        return;
    }
    req.value = validation.value;
    next();
};

// const handleUpdateSource = async (req: Request, res: Response) => {
//     const validation = emptySchema.validate(req.body);
//     if (validation.error) {
//         handleError(req, res, validation.error.name, validation.error.message);
//         return;
//     }

// }

const handlePurchase5Pack = async (req: Request, res: Response) => {
    try {
        await stripe.charges.create({
            amount: 100,
            currency: "usd",
            customer: req.user.stripeId
        });
    } catch (err) {
        res.sendStatus(400);
        handleError(req, null, err.type, err.message);
        return;
    }
    const rmExtraPrints = req.user.rmExtraPrints + 5;
    const rmShapeCapacity = req.user.rmShapeCapacity + 5;
    await users.findOneAndUpdate(
        { email: req.user.email },
        {
            $set: {
                rmExtraPrints,
                rmShapeCapacity
            }
        }
    );
    res.send();
};

const handleLogout = async (req: Request, res: Response) => {
    req.session.destroy(() => {
        res.send();
    });
};

const handleGetUser = async (req: Request, res: Response) => {
    const user = req.user;
    delete user.pwhash;
    delete user.stripeId;
    delete user.subscriptionId;
    res.send(user);
};

const signupSchema = joi.object().keys({
    email: joi
        .string()
        .email()
        .required(),
    password: joi
        .string()
        .zxcvbn(3)
        .required(),
    source: joi.string().required()
});

const handleSignup = async (req: Request, res: Response) => {
    const { email, password, source } = req.value;
    const user = await users.findOne({ email });
    if (user) {
        handleError(req, res, "DuplicateUserError", "User already exists");
        return;
    }

    let customer: Customer;
    try {
        logMessage(req, "Awaiting customer creation");
        customer = await stripe.customers.create({ source, email });
    } catch (err) {
        handleError(req, res, err.type, err.message);
        return;
    }
    const card = customer.sources.data.find(
        customerSource => customerSource.id === customer.default_source
    ) as ICard;
    logMessage(req, `Successful signup with username [${email}]`);
    const confirmationKey = toBase64(sodium.crypto_auth_keygen());
    try {
        const pwhash = sodium.crypto_pwhash_str(
            req.body.password,
            sodium.crypto_pwhash_OPSLIMIT_SENSITIVE,
            sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE
        );
        await users.insertOne({
            cardBrand: card.brand,
            cardExpMonth: card.exp_month,
            cardExpYear: card.exp_year,
            cardLast4: card.last4,
            confirmationKey,
            email,
            pwhash,
            rmExtraPrints: 0,
            rmMonthlyPrints: 0,
            rmShapeCapacity: 0,
            rmShapes: {},
            stripeId: customer.id,
            subscriptionCurrentPeriodEnd: 0
            //  stripe_cust: customer,
        });
    } catch (err) {
        res.status(400).json(distillError(err));
        return;
    }
    // tslint:disable:object-literal-sort-keys
    const data = {
        from: "RhythMandala <signups@rhythmandala.com>",
        to: email,
        subject: "Follow Link to Complete Signup",
        html: `${emailBody1}email=${email}&key=${confirmationKey}${emailBody2}`
    };
    // tslint:enable:object-literal-sort-keys

    // const mg_response = await mailgun.messages().send(data);
    // console.log(mg_response);
    res.send();
};

const confirmEmailSchema = joi.object().keys({
    email: joi.string().required(),
    key: joi.string().required()
});

const handleConfirmEmail = async (req: Request, res: Response) => {
    const { email, key } = req.value;
    const handleConfError = () => {
        // don't let on if an email exists
        handleError(
            req,
            res,
            "EmailConfirmationError",
            `There was an error confirming ${email}`
        );
    };

    // Check if user exists
    const user = await users.findOne({ email });
    if (!user) {
        handleConfError();
        console.log("MissingUserError", `User ${email} does not exist`);
        return;
    }

    // Check if user is already confirmed
    if (!user.confirmationKey) {
        handleConfError();
        console.log("UserAlreadyConfirmedError", "User is already confirmed");
        return;
    }

    // Check if key is correct
    if (key !== user.confirmationKey) {
        handleConfError();
        console.log("ConfirmationKeyError", `Key does not match`);
        return;
    }

    // Update DB
    await users.findOneAndUpdate(
        { email },
        { $unset: { confirmationKey: "" } }
    );
    console.log(`EMAIL_CONFIRMATION_SUCCESSFUL: with email [${email}]`);

    // Create Stripe subscription
    console.log("Awaiting subscription creation");
    try {
        await stripe.subscriptions.create({
            customer: user.stripeId,
            items: [{ plan }]
        });
    } catch (err) {
        res.send(); // ??
        handleError(req, null, err.type, err.message);
        return;
    }
    req.session.email = email;
    res.send();
};

const handleStripeWebhook = async (req: Request, res: Response) => {
    // console.log(JSON.stringify(req.body, null, 4));
    console.log("New Webhook:");
    const object = req.body.data.object;

    const customerId = object.customer || object.id;
    let stripeCustomer;
    let user;

    try {
        stripeCustomer = await stripe.customers.retrieve(customerId);
        // console.log(JSON.stringify(stripe_user, null, 4));
        user = await users.findOne({ stripeId: customerId });
        if (!user) {
            return;
        }
        // console.log(JSON.stringify(diff(user.stripe_cust, stripe_user), null, 4));
        if (
            stripeCustomer.subscriptions.total_count > 0 &&
            stripeCustomer.subscriptions.data[0].current_period_end >
                user.subscriptionCurrentPeriodEnd
        ) {
            const subscription = stripeCustomer.subscriptions.data[0];
            const subscriptionId = subscription.id;
            const subscriptionCurrentPeriodEnd =
                subscription.current_period_end;
            const subscriptionStatus = subscription.status;
            const rmShapeCapacity = user.rmShapeCapacity + 5;
            const rmMonthlyPrints = 5;
            await users.findOneAndUpdate(
                { stripeId: customerId },
                {
                    $set: {
                        rmMonthlyPrints,
                        rmShapeCapacity,
                        subscriptionCurrentPeriodEnd,
                        subscriptionId,
                        subscriptionStatus
                    }
                }
            );
        }
        // await users.findOneAndUpdate(
        //  { stripe_id: customer_id },
        //  { $set: { stripe_cust: stripe_user } }
        // );
        // user = await users.findOne({ stripeId: customerId });
        // console.log(JSON.stringify(user, null, 4));
        // console.log(customer_id.black.bgRed);
        // console.log(req.body.type.black.bgRed);
    } catch (err) {
        console.log(err);
    }
};

// let loginSchema: plainJoi.JoiObject;

const loginSchema = joi.object().keys({
    email: joi.string().required(),
    password: joi.string().required()
});

const handleLogin = async (req: Request, res: Response) => {
    const { email, password } = req.value;
    const user = await users.findOne({ email: req.body.email });

    if (!user) {
        console.log(`LOGIN_FAILED: [${email}] not in database`);
        handleError(req, res, "LoginError", "Login Error");
        return;
    }

    if (user.confirmationKey) {
        console.log(`LOGIN_FAILED: [${email}] has not been confirmed`);
        handleError(
            req,
            res,
            "AccountNotConfirmed",
            "Account has not been confirmed"
        );
        return;
    }

    const isValid = sodium.crypto_pwhash_str_verify(user.pwhash, password);

    if (!isValid) {
        console.log(`LOGIN_FAILED: bad password with username [${email}]`);
        handleError(req, res, "LoginError", "Login Error");
    }
    console.log(`LOGIN_SUCCESSFUL: with username [${email}]`);
    req.session.email = email;
    res.send();
};

const schemas: { [key: string]: plainJoi.Schema } = {
    signupSchema,
    loginSchema,
    confirmEmailSchema
};

const toBase64 = (bytes: Uint8Array) => {
    return sodium.to_base64(bytes, sodium.base64_variants.URLSAFE_NO_PADDING);
};

const handleError = (
    req: Request,
    res: Response,
    code: string,
    message: string
) => {
    const path = req.url.toUpperCase();
    logMessage(req, `${code}: ${message}`);
    if (res) {
        res.status(400).json({ code, message });
    }
};

const logMessage = (req: Request, message: string) => {
    console.log(`${req.url.toUpperCase()}: ${message}`);
};

// function distillError(error: IStripeError) {
//  return (({ code, message, param, type }) => ({ code, message, param, type }))(error)
// }

function distillError(error: any) {
    delete error.stack;
    return error;
}

const close = async () => {
    await expressServer.close();
    await mongoClient.close();
    await (sessionStore as any).close(); // submitted pull request to DefinitelyTyped
    // await sessionStore.close();
};

function getUsers() {
    return users;
}

let mochaCallback: () => {};

function setMochaCallback(callback: () => {}) {
    mochaCallback = callback;
}

module.exports = {
    app,
    close,
    getUsers,
    handleError,
    handleStripeWebhook,
    setMochaCallback,
    users
};
