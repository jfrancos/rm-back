import assert from "assert";
import bodyParser from "body-parser";
import "colors";
import connectMongo from "connect-mongo";
import dotenv from "dotenv";
import express, { Request, Response, NextFunction, Application } from "express";
import session from "express-session";
import helmet from "helmet";
import plainJoi from "joi";
const joiZxcvbn = require("joi-zxcvbn");
import sodium from "libsodium-wrappers-sumo";
import Mailgun from "mailgun-js";
import mongodb from "mongodb";
import Stripe, { IStripeError, customers, subscriptions, ICard } from "stripe";
import zxcvbn from "zxcvbn";
import * as http from "http";
// const fs = require ('fs');

// var diff = require("deep-diff").diff;

dotenv.config();
type Customer = customers.ICustomer;
type Subscription = subscriptions.ISubscription;
const MongoStore = connectMongo(session);

// process.on('uncaughtException', (err) => {
//   fs.writeSync(1, `Caught exception: ${err}\n`);
// });

const joi = plainJoi.extend(joiZxcvbn(plainJoi));

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
let server: mongodb.MongoClient;
let users: mongodb.Collection;
let secrets: mongodb.Collection;
const mongodb_uri = process.env.MONGODB_URI;
const mongoInit = async () => {
	server = await mongodb.connect(
		mongodb_uri,
		{ useNewUrlParser: true }
	);
	users = await server.db().collection("users");
	secrets = await server.db().collection("secrets");
	try {
		console.log("creating index");
		await users.createIndex({ email: 1 }, { unique: true });
	} catch (err) {
		console.log(err);
	}
	if (await secrets.countDocuments() === 0) {
		await secrets.insertOne({ secret: to_base64(sodium.crypto_auth_keygen()) });
	}
	secret = (await secrets.findOne({})).secret;
};

// Express Init
const app = express();
const port = process.env.PORT;
let expressServer: http.Server;
app.use(helmet());
app.use(bodyParser.json());
const store = new MongoStore({ url: mongodb_uri });
let protectedSession;

// Start DB then Express then Mocha callback
(async () => {
	await sodium.ready;
	await mongoInit();
	const resave = false;
	const saveUninitialized = false;
	const user = session({ store, secret, resave, saveUninitialized });
	app.post("/user/*", user);
	app.post("/user/signup", handleSignup);
	app.post("/user/get_user", handleGetUser);
	// app.post("/auth/login", handleLogin);
	app.post("/confirm_email", handleConfirmEmail);
	app.post("/stripe", handleStripeWebhook);

	expressServer = await app.listen(port);
	if (mocha_callback) {
		mocha_callback();
	}
})();

const handleGetUser = async (req: Request, res: Response) => {
	const user = await users.findOne({ email: req.session.email });
	res.send({ user });
};

// app.post('/auth/delete', (req: Request, res: Response) => {
	// stripe.customers.del(customer.id).catch((err) => console.log('Customer deletion error:\n',
	// 	(({ rawType, code, param, message, detail }) => ({ rawType, code, param, message, detail }))(err)));
	// res.send();
// });

const signupSchema = joi.object().keys({
	password: joi
		.string()
		.zxcvbn(3)
		.required(),
	source: joi.string().required(),
	email: joi
		.string()
		.email()
		.required()
});

const handleSignup = async (req: Request, res: Response) => {
	const validation = signupSchema.validate(req.body);
	if (validation.error) {
		handleError(req, res, validation.error.name, validation.error.message);
		return;
	}

	const { email, password, source } = validation.value;
	let user = await users.findOne({ email });
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
		source => source.id === customer.default_source
	) as ICard;
	logMessage(req, `Successful signup with username [${email}]`);
	const confirmation_key = to_base64(sodium.crypto_auth_keygen());
	try {
		const pwhash = sodium.crypto_pwhash_str(
			req.body.password,
			sodium.crypto_pwhash_OPSLIMIT_SENSITIVE,
			sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE
		);
		await users.insertOne({
			email,
			confirmation_key,
			pwhash,
			stripe_id: customer.id,
			brand: card.brand,
			last4: card.last4,
			exp_year: card.exp_year,
			exp_month: card.exp_month,
			//	stripe_cust: customer,
			current_period_end: 0,
			shape_capacity: 0,
			monthly_prints: 0,
			extra_prints: 0,
			shapes: {}
		});
	} catch (err) {
		res.status(400).json(distillError(err));
		return;
	}
	const data = {
		from: "RhythMandala <signups@rhythmandala.com>",
		to: email,
		subject: "Follow Link to Complete Signup",
		html: `${emailBody1}email=${email}&key=${confirmation_key}${emailBody2}`
	};
	// const mg_response = await mailgun.messages().send(data);
	// console.log(mg_response);
	req.session.email = email;
	res.send();
};

const confirmEmailSchema = joi.object().keys({
	// how to make sure only these two are included
	email: joi.string().required(),
	key: joi.string().required()
});

const handleConfirmEmail = async function(req: Request, res: Response) {
	// Joi validation
	const validation = confirmEmailSchema.validate(req.body);
	if (validation.error) {
		handleError(req, res, validation.error.name, validation.error.message);
		return;
	}

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
	const { email, key } = validation.value;
	const user = await users.findOne({ email });
	if (!user) {
		handleConfError();
		console.log("MissingUserError", `User ${email} does not exist`);
		return;
	}

	// Check if user is already confirmed
	if (!user.confirmation_key) {
		handleConfError();
		console.log("UserAlreadyConfirmedError", "User is already confirmed");
		return;
	}

	// Check if key is correct
	if (key != user["confirmation_key"]) {
		handleConfError();
		console.log("ConfirmationKeyError", `Key does not match`);
		return;
	}

	// Update DB
	await users.findOneAndUpdate(
		{ email: email },
		{ $unset: { confirmation_key: "" } }
	);
	console.log(`EMAIL_CONFIRMATION_SUCCESSFUL: with email [${email}]`);

	// Create Stripe subscription
	console.log("Awaiting subscription creation");
	let subscription;
	try {
		subscription = await stripe.subscriptions.create({
			customer: user.stripe_id,
			items: [{ plan }]
		});
	} catch (err) {
		res.send();
		handleError(req, null, err.type, err.message);
		return;
	}
	res.send();
};

const handleStripeWebhook = async (req: Request, res: Response) => {
	// console.log(JSON.stringify(req.body, null, 4));
	console.log("New Webhook:");
	const object = req.body.data.object;

	const customer_id = object.customer || object.id;
	let stripe_user, user;

	try {
		stripe_user = await stripe.customers.retrieve(customer_id);
		// console.log(JSON.stringify(stripe_user, null, 4));
		user = await users.findOne({ stripe_id: customer_id });
		if (!user) {
			return;
		}
		//console.log(JSON.stringify(diff(user.stripe_cust, stripe_user), null, 4));
		if (
			stripe_user.subscriptions.total_count > 0 &&
			stripe_user.subscriptions.data[0].current_period_end >
				user.current_period_end
		) {
			const subscription = stripe_user.subscriptions.data[0];
			const current_period_end = subscription.current_period_end;
			const status = subscription.status;
			const shape_capacity = user.shape_capacity + 5;
			const monthly_prints = 5;
			await users.findOneAndUpdate(
				{ stripe_id: customer_id },
				{
					$set: {
						shape_capacity,
						monthly_prints,
						current_period_end,
						status
					}
				}
			);
		}
		// await users.findOneAndUpdate(
		// 	{ stripe_id: customer_id },
		// 	{ $set: { stripe_cust: stripe_user } }
		// );
		user = await users.findOne({ stripe_id: customer_id });
		//console.log(JSON.stringify(user, null, 4));
		// console.log(customer_id.black.bgRed);
		// console.log(req.body.type.black.bgRed);
	} catch (err) {
		console.log(err);
	}
};

const handleLogin = async function(req: Request, res: Response) {
	const user = await users.findOne({ email: req.body.email });
	const isValid = sodium.crypto_pwhash_str_verify(
		user["pwhash"],
		req.body.password
	);
	const email = req.body.email;
	if (isValid) {
		console.log(`LOGIN_SUCCESSFUL: with username [${email}]`);
		req.session.email = email;
		res.send();
	} else {
		console.log(`LOGIN_FAILED: with username [${email}]`);
		res.send({ error: "Login error" });
	}
};

const to_base64 = (bytes: Uint8Array) => {
	return sodium.to_base64(bytes, sodium.base64_variants.URLSAFE_NO_PADDING);
};

const handleError = (
	req: Request,
	res: Response,
	code: String,
	message: String
) => {
	const path = req.url.toUpperCase();
	logMessage(req, `${code}: ${message}`);
	if (res) {
		res.status(400).json({ code, message });
	}
};

const logMessage = (req: Request, message: String) => {
	console.log(`${req.url.toUpperCase()}: ${message}`);
};

// function distillError(error: IStripeError) {
// 	return (({ code, message, param, type }) => ({ code, message, param, type }))(error)
// }

function distillError(error: any) {
	delete error.stack;
	return error;
}

const close = async () => {
	await expressServer.close();
	await server.close();
	await (store as any).close();
};

function getUsers() {
	return users;
}

let mocha_callback: () => {};

function setMochaCallback(callback: () => {}) {
	mocha_callback = callback;
}

module.exports = {
	app,
	setMochaCallback,
	close,
	getUsers,
	users,
	handleStripeWebhook,
	handleError
};
