import bodyParser from "body-parser";
import connectMongo from "connect-mongo"; // express-session store
import dotenv from "dotenv";
import express, { Application, NextFunction, Request, Response } from "express";
import expressSession from "express-session";
import helmet from "helmet";
import http from "http";
import sodium from "libsodium-wrappers-sumo";
import _ from "lodash";
import Mailgun from "mailgun-js";
import mongodb from "mongodb";
import Stripe, { ICard, IStripeError, subscriptions } from "stripe";
import { inspect } from 'util' // or directly
import validate from "./validate";
dotenv.config();

// type Customer = Stripe.customers.ICustomer;

// Libsodium Init
const sodiumInit = async () => {
    await sodium.ready;
    process.removeAllListeners("uncaughtException");
    process.removeAllListeners("unhandledRejection"); // wtf libsodium https://github.com/jedisct1/libsodium.js/issues/177
};

// Express Session Init
let sessionStore: connectMongo.MongoStore;
const sessionInit = () => {
    const MongoStore = connectMongo(expressSession);
    sessionStore = new MongoStore({ url: process.env.MONGODB_URI });
    const resave = false;
    const saveUninitialized = false;
    const store = sessionStore;
    const secret = process.env.SESSION_KEY;
    return expressSession({ resave, saveUninitialized, secret, store });
};

// Mailgun Init
let mailgun: Mailgun.Mailgun;
const emailBody1 = `<p>Dear Rhythm Aficionado,
    <p>Thank you for subscribing to RhythMandala! Our goal is to make complex \
rhythmic structures from all across the globe simple, accessible and playable \
so that everyone can enjoy the benefits of understanding and experiencing \
rhythm in the body. If you have any questions, please email ryan@tapgym.com.
    <p>Go ahead and <a href='https://app.rhythmandala.com?`;
const emailBody2 = `'>click this link to complete your registration</a> and \
have fun!`;
const mailgunInit = () => {
    const domain = "mg.rhythmandala.com";
    const apiKey = process.env.MG_KEY;
    return new Mailgun({ apiKey, domain });
};

// Stripe Init
let webhook: any;
const stripe = new Stripe(process.env.STRIPE_KEY);
const plan = process.env.STRIPE_PLAN;
const stripeInit = async (url: string) => {
    const limit = 100;
    const webhooks = await (stripe as any).webhookEndpoints.list({ limit });
    const data = webhooks.data;
    data.forEach(async (datum: any) =>
        (stripe as any).webhookEndpoints.del(datum.id)
    );
    url += "/stripe";
    webhook = await (stripe as any).webhookEndpoints.create({
        enabled_events: ["*"],
        url
    });
};

// Mongo Init
let mongoClient: mongodb.MongoClient;
let users: mongodb.Collection;
let shapes: mongodb.Collection;
const mongoInit = async () => {
    mongoClient = await mongodb.connect(
        process.env.MONGODB_URI,
        { useNewUrlParser: true }
    );
    users = mongoClient.db().collection("users");
    shapes = mongoClient.db().collection("shapes");
    console.log("creating index");
    await users.createIndex({ email: 1 }, { unique: true });
};

// Express Init
const app = express();
const expressInit = (session: express.Handler) => {
    app.use(helmet());
    app.post("/stripe", bodyParser.raw({ type: "*/*" }),
        handleStripeWebhook,
        updateStripeInfo);

    app.use(bodyParser.json(), validate, session, getUser);
    app.post("/update-source",
        handleUpdateSource,
        updateStripeInfo);
    app.post("/cancel-subscription",
        handleCancelSubscription,
        updateStripeInfo);
    app.post("/signup",
        handleSignup,
        updateStripeInfo);
    app.post("/key-login",
        handleConfirmEmail,
        updateStripeInfo); // If it's the first key-login

    app.post("/login", handleLogin);
    app.post("/get-user", handleGetUser);
    app.post("/logout", handleLogout);
    app.post("/purchase-five-pack", handlePurchase5Pack);
    app.post("/resend-conf-email", handleResendConfEmail);
    app.post("/update-password");
    app.post("/set-shape");
    app.post("/delete-shape");
    app.post("/get-pdf");
};

// Start server
const startServer = async (url: string) => {
    await Promise.all([stripeInit(url), sodiumInit(), mongoInit()]);
    const session = sessionInit();
    expressInit(session);
    mailgun = mailgunInit();
    const expressServer = app.listen(process.env.PORT);
    expressServer.on("close", async () => {
        await mongoClient.close();
        await (sessionStore as any).close(); // submitted pull request to DefinitelyTyped
        await (stripe as any).webhookEndpoints.del(webhook.id);
        process.exit(); // to kill ngrok during testing
    });
    process.on("SIGTERM", () => {
        expressServer.close();
    });
};

const getUser = async (req: Request, res: Response, next: NextFunction) => {
    if (!req.session || !req.session.email) {
        next();
        return;
    }
    req.user = await users.findOne({ email: req.session.email });
    if (!req.user) {
        next("Could not find user");
        return; // how would we even get here?
    }
    next();
};

const updateStripeInfo = async (req: Request, res: Response) => {
    const customer = req.customer;
    let subscription = req.subscription || customer.subscriptions.data[0];

    const set: { [key: string]: any } = {};

    if (subscription) {
        const keys = [
            "current_period_end",
            "id",
            "status",
            "cancel_at_period_end"
        ];
        subscription = _.pick(subscription, keys);

        if (!_.isEqual(subscription, req.user.subscription)) {
            set.subscription = subscription;
            if (
                subscription.current_period_end >
                req.user.subscription.current_period_end
            ) {
                set.rmShapeCapacity = req.user.rmShapeCapacity + 5;
                set.rmMonthlyPrints = 5;
            }
        }
    }
    if (customer && customer.default_source) {
        const sourceId = customer.default_source;
        let source: { [key: string]: any } = customer.sources.data.find(
            customerSource => (customerSource as any).id === sourceId
        );
        const keys = ["last4", "brand", "exp_month", "exp_year", "id"];
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
    console.log("updated user");
    res.send();
};

const handleCancelSubscription = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        req.subscription = await stripe.subscriptions.update(
            req.user.subscription.id,
            { cancel_at_period_end: true }
        );
        // customer = await stripe.customers.deleteSource(req.user.stripeId, req.user.sourceId); // Is this necessary?
        // customer = await stripe.customers.retrieve(req.user.stripeId);
    } catch (err) {
        res.sendStatus(400);
        handleError(req, null, err.type, err.message);
        return;
    }
    // console.log(customer)
    next();
};

const handleConfirmEmail = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
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
    let user = await users.findOne({ email });
    if (!user) {
        handleConfError();
        console.log("MissingUserError", `User ${email} does not exist`);
        return;
    }

    // Check if user is already confirmed
    if (!user.confKeyHash) {
        handleConfError();
        console.log("UserAlreadyConfirmedError", "User is already confirmed");
        return;
    }

    // Check if key is correct
    const isValid = sodium.crypto_pwhash_str_verify(user.confKeyHash, key);
    if (!isValid) {
        handleConfError();
        console.log("ConfirmationKeyError", `Key does not match`);
        return;
    }

    // Update DB
    user = await users.findOneAndUpdate({ email }, { $unset: { confKeyHash: "" } });
    console.log(`EMAIL_CONFIRMATION_SUCCESSFUL: with email [${email}]`);
    // Create Stripe subscription
    console.log("Awaiting subscription creation");
    let subscription: subscriptions.ISubscription;
    try {
        subscription = await stripe.subscriptions.create({
            customer: user.value.stripeId,
            items: [{ plan }]
        });
    } catch (err) {
        res.send(); // ??
        handleError(req, null, err.type, err.message);
        return;
    }
    console.log("successful subscritpion creation");
    req.session.email = email;
    req.subscription = subscription;
    req.user = user.value;
    // console.log("ops", user.value);
    next();
};

const handleGetUser = async (req: Request, res: Response) => {
    const user = req.user;
    if (!user) {
        res.sendStatus(401);
        return;
    }
    delete user.pwhash;
    delete user.stripeId;
    // delete user.subscriptionId;
    res.send(user);
};

const handleLogin = async (req: Request, res: Response) => {
    const { email, password } = req.value;
    const user = await users.findOne({ email: req.body.email });

    if (!user) {
        console.log(`LOGIN_FAILED: [${email}] not in database`);
        handleError(req, res, "LoginError", "Login Error");
        return;
    }

    if (user.confKeyHash) {
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

const handleLogout = async (req: Request, res: Response) => {
    delete req.session.email;
    res.send();
};

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

const handleResendConfEmail = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    sendConfEmail(req.session.email);
};

const handleSignup = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    console.log("ENTERING SETUP");
    const { email, password, source } = req.value;
    let user = await users.findOne({ email });
    if (user) {
        handleError(req, res, "DuplicateUserError", "User already exists");
        return;
    }

    try {
        logMessage(req, "Awaiting customer creation");
        req.customer = await stripe.customers.create({ source, email });
    } catch (err) {
        handleError(req, res, err.type, err.message);
        return;
    }
    logMessage(req, `Successful signup with username [${email}]`);
    try {
        const pwhash = sodium.crypto_pwhash_str(
            req.body.password,
            sodium.crypto_pwhash_OPSLIMIT_SENSITIVE,
            sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE
        );
        user = await users.insertOne({
            confKeyHash: "",
            email,
            pwhash,
            rmExtraPrints: 0,
            rmMonthlyPrints: 0,
            rmShapeCapacity: 0,
            rmShapes: {},
            source: {},
            stripeId: req.customer.id,
            subscription: { current_period_end: 0 }
        });
    } catch (err) {
        res.status(400).json(distillError(err));
        return;
    }
    sendConfEmail(email);
    req.session.email = email;
    req.user = user.ops;
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

const handleStripeWebhook = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    // console.log(JSON.stringify(inspect(req), null, 4));
    console.log("New Webhook:");
    const sig = req.headers["stripe-signature"];
    let event;
    try {
        event = stripe.webhooks.constructEvent(req.body, sig, webhook.secret);
    } catch (err) {
        console.log("invalid webhook")
        res.sendStatus(400);
        return;
    }
    const object = event.data.object;
    const customerId = object.customer || object.id;
    try {
        req.customer = await stripe.customers.retrieve(customerId);
        // console.log(JSON.stringify(stripeCustomer, null, 4));
        req.user = await users.findOne({ stripeId: customerId });
        if (!req.user) {
            res.sendStatus(400);
            console.log("no req");
            return;
        }
    } catch (err) {
        console.log(err);
        res.sendStatus(400);
        return;
    }
    next();
};

const sendConfEmail = async (email: string) => {
    const confirmationKey = toBase64(sodium.crypto_auth_keygen());
    const confKeyHash = sodium.crypto_pwhash_str(
        confirmationKey,
        sodium.crypto_pwhash_OPSLIMIT_SENSITIVE,
        sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE
    );
    users.findOneAndUpdate({ email }, { $set: { confKeyHash } });
    // tslint:disable:object-literal-sort-keys
    const data = {
        from: "RhythMandala <signups@rhythmandala.com>",
        to: email,
        subject: "Follow Link to Complete Signup",
        html: `${emailBody1}email=${email}&key=${confirmationKey}${emailBody2}`
    };
    // tslint:enable:object-literal-sort-keys
    const mgResponse = await mailgun.messages().send(data);
    console.log(mgResponse);
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

function getUsers() {
    return users;
}

if (require.main === module) {
    startServer( process.env.URL || process.argv[2] );
}

module.exports = {
    app,
    getUsers,
    handleError,
    startServer
};

export default module.exports;
