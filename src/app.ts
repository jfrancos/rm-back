import assert from "assert";
import bodyParser from "body-parser";
import "colors";
import connectMongo from "connect-mongo";
import dotenv from "dotenv";
import errorhandler from "errorhandler";
import express, { Application, NextFunction, Request, Response } from "express";
import expressSession from "express-session";
import helmet from "helmet";
import http from "http";
import sodium from "libsodium-wrappers-sumo";
import _ from "lodash";
import Mailgun from "mailgun-js";
import mongodb from "mongodb";
import Stripe, { ICard, IStripeError } from "stripe";
import validate from "./validate";

// const fs = require ('fs');
// var diff = require("deep-diff").diff;

dotenv.config();
type Customer = Stripe.customers.ICustomer;
type Subscription = Stripe.subscriptions.ISubscription;
const MongoStore = connectMongo(expressSession);

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
let shapes: mongodb.Collection;
const mongodbUri = process.env.MONGODB_URI;
const mongoInit = async () => {
    mongoClient = await mongodb.connect(
        mongodbUri,
        { useNewUrlParser: true }
    );
    users = mongoClient.db().collection("users");
    secrets = mongoClient.db().collection("secrets");
    shapes = mongoClient.db().collection("shapes");
    try {
        console.log("creating index");
        await users.createIndex({ email: 1 }, { unique: true });
    } catch (err) {
        console.log(err);
    }
    if ((await secrets.countDocuments()) === 0) {
        await secrets.insertOne({
         //   secret: toBase64(sodium.crypto_auth_keygen())
        });
    }
    secret = (await secrets.findOne({})).secret;
};

// Express Init
const app = express();
const port = process.env.PORT;
console.log(port)
let expressServer: http.Server;
app.use(helmet());
app.use(bodyParser.json());

const sessionStore = new MongoStore({ url: mongodbUri });



// // Start DB then Express then Mocha callback
(async () => {
    process.removeAllListeners('uncaughtException'); // wtf libsodium https://github.com/jedisct1/libsodium.js/issues/177
    process.removeAllListeners('unhandledRejection'); 
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
    app.post("/new-session/confirm_email", handleConfirmEmail, getUser);            // Interacts with Stripe -- returns subscription
    app.post("/session/*", session, validate, getUser);
    app.post("/session/get_user", handleGetUser);
    app.post("/session/logout", handleLogout);
    app.post("/session/update-source", handleUpdateSource);                // Interacts with Stripe -- returns customer
    app.post("/session/purchase_five_pack", handlePurchase5Pack);          // Interacts with Stripe -- returns charge object
    app.post("/session/cancel-subscription", handleCancelSubscription);    // Interacts with Stripe -- returns subscription
    app.post("/signup", session, validate, handleSignup, getUser);         // Interacts with Stripe -- returns customer // do i really want session here?
    app.post("/stripe", handleStripeWebhook);                              // returns customer
    app.post("/*", updateUser);
    // app.post("/resend-conf-email", handleResendConfEmail);
    // app.post("/reset-password", handleResetPassword);
    // app.post("/session/update-shapes", handleUpdateShapes);
    // app.post("/session/get-pdf", handleGetPdf);

    try {
        expressServer = app.listen(port);
    } catch (err) {
        console.log(err);
    }
    if (mochaCallback) {
        mochaCallback();
    }
})();

const getUser = async (req: Request, res: Response, next: NextFunction) => {
    console.log("entering getUser")
    // let user;
    const user = await users.findOne({ email: req.session.email });

    // try {
    //     const email = req.session && req.session.email;
    //     // const stripeId = req.customer && req.customer.id;
    //     // user = await users.findOne({ $or: [{ email }, { stripeId }] });
    // } catch (err) {
    //     console.log(err);
    // }
    if (!user) {
        res.sendStatus(401);
        return; // how would we even get here?
    }
    req.user = user;
    next();
};

const handleUpdateSource = async (req: Request, res: Response) => {
    const stripeId = req.user.stripeId;
    const { source } = req.value;
    try {
        logMessage(req, "Awaiting customer update");
        req.customer = await stripe.customers.update(stripeId, { source });
    } catch (err) {
        handleError(req, res, err.type, err.message);
        return;
    }
    res.send();
};

const handleCancelSubscription = async (req: Request, res: Response, next: NextFunction) => {
    try {
        req.subscription = await stripe.subscriptions.update(req.user.subscription.id, { cancel_at_period_end: true });
        // customer = await stripe.customers.deleteSource(req.user.stripeId, req.user.sourceId); // Is this necessary?
        // customer = await stripe.customers.retrieve(req.user.stripeId);
    } catch (err) {
        res.sendStatus(400);
        handleError(req, null, err.type, err.message);
        return;
    }
    // console.log(customer)
    next();
}

const updateUser = async (req: Request, res: Response) => {
    console.log("updating use")
    const customer: Customer = req.customer;
    let subscription = req.subscription || customer.subscriptions.data[0];
    const set: { [key: string]: any } = {};

    if (subscription) {
        const keys = [ 'current_period_end', 'id', 'status', 'cancel_at_period_end' ];
        subscription = _.pick(subscription, keys);

        if (!_.isEqual(subscription, req.user.subscription)) {
            set.subscription = subscription;
            if (subscription.current_period_end > req.user.subscription.current_period_end) {
                set.rmShapeCapacity = req.user.rmShapeCapacity + 5;
                set.rmMonthlyPrints = 5;
            }
        }
    }
    if (customer && customer.default_source) {
        const sourceId = customer.default_source;
        let source: { [key: string]: any } = customer.sources.data.find(
            customerSource => customerSource.id === sourceId
        );
        const keys = ['last4', 'brand', 'exp_month', 'exp_year', 'id'];
        source = _.pick(source, keys);
        if (!_.isEqual(source, req.user.source)) {
            set.source = source;
        }
    }
    if (Object.keys(set).length > 0) {
        try {
            await users.findOneAndUpdate(
                { stripeId: req.user.stripeId },
                { $set: set }
            );
        } catch (err) {
            console.log(err);
        }
    }
    res.send();
}

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
    // delete user.subscriptionId;
    res.send(user);
};

const handleSignup = async (req: Request, res: Response, next: NextFunction) => {
    console.log("ENTERING SETUP")
    const { email, password, source } = req.value;
    const user = await users.findOne({ email });
    if (user) {
        handleError(req, res, "DuplicateUserError", "User already exists");
        return;
    }

//    let customer: Customer;
    try {
        logMessage(req, "Awaiting customer creation");
        req.customer = await stripe.customers.create({ source, email });
        // console.log(customer);
    } catch (err) {
        handleError(req, res, err.type, err.message);
        return;
    }
    logMessage(req, `Successful signup with username [${email}]`);
    const confirmationKey = toBase64(sodium.crypto_auth_keygen());
    try {
        const pwhash = sodium.crypto_pwhash_str(
            req.body.password,
            sodium.crypto_pwhash_OPSLIMIT_SENSITIVE,
            sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE
        );
        await users.insertOne({
            confirmationKey,
            email,
            pwhash,
            rmExtraPrints: 0,
            rmMonthlyPrints: 0,
            rmShapeCapacity: 0,
            rmShapes: {},
            source: {},
            stripeId: req.customer.id,
            subscription: { current_period_end: 0 },
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
    req.session.email = email;
    next();
};

const handleConfirmEmail = async (req: Request, res: Response, next: NextFunction) => {
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
    let subscription: Subscription;
    try {
        subscription = await stripe.subscriptions.create({
            customer: user.stripeId,
            items: [{ plan }]
        });
    } catch (err) {
        res.send(); // ??
        handleError(req, null, err.type, err.message);
        return;
    }
    req.session.email = email;
    req.subscription = subscription;
    next();
};

const handleStripeWebhook = async (req: Request, res: Response, next: NextFunction) => {
    // console.log(JSON.stringify(req.body, null, 4));
    console.log("New Webhook:");
    const object = req.body.data.object;
    const customerId = object.customer || object.id;
    console.log('webook')
    try {
        req.customer = await stripe.customers.retrieve(customerId);
        // console.log(JSON.stringify(stripeCustomer, null, 4));
        req.user = await users.findOne({ stripeId: customerId });
        if (!req.user) {
            return;
        }
    } catch (err) {
        console.log(err);
    }
    next();
};

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

const toBase64 = (bytes: Uint8Array) => {
    return sodium.to_base64(bytes, sodium.base64_variants.URLSAFE_NO_PADDING);
};

const handleError = (
    req: Request,
    res: Response,
    code: string,
    message: string
) => {
    // const path = req.url.toUpperCase();
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
    expressServer.close();
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

export default module.exports;
