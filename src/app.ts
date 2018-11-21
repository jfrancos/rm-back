import assert from 'assert';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import express, { Request, Response, NextFunction, Application } from "express";
import helmet from 'helmet';
import plainJoi from 'joi';
const joiZxcvbn = require('joi-zxcvbn');
import sodium from 'libsodium-wrappers-sumo';
import Mailgun from 'mailgun-js';
import mongodb from 'mongodb';
import Stripe, { IStripeError, customers, subscriptions, ICard } from 'stripe';
import zxcvbn from 'zxcvbn';
import * as http from 'http'

dotenv.config();
type Customer = customers.ICustomer;
type Subscription = subscriptions.ISubscription;

const token_window = 60000;
const joi = plainJoi.extend(joiZxcvbn(plainJoi));

// Mailgun Init
const domain = 'mg.rhythmandala.com';
const apiKey = process.env.MG_KEY;
const mailgun = new Mailgun({ apiKey, domain });
const emailBody1 = `<p>Dear Rhythm Aficionado,
	<p>Thank you for subscribing to RhythMandala! Our goal is to make complex \
rhythmic structures from all across the globe simple, accessible and playable \
so that everyone can enjoy the benefits of understanding and experiencing \
rhythm in the body. If you have any questions, please email ryan@tapgym.com.
	<p>Go ahead and <a href='https://app.rhythmandala.com?`
const emailBody2 = `'>click this link to complete your registration</a> and \
have fun!`


// Stripe Init
const stripe = new Stripe(process.env.STRIPE_KEY);
const plan = process.env.STRIPE_PLAN;

// Mongo Init
let users: mongodb.Collection;
let server: mongodb.MongoClient;
const mongodb_uri = process.env.MONGODB_URI;
const mongoInit = async () => {
	server = await mongodb.connect(mongodb_uri, { useNewUrlParser: true });
	users = await server.db().collection('users');
	await users.createIndex( { 'email': 1 }, { unique: true } );
};

// Express Init
const app = express();
const port = process.env.PORT;
let expressServer: http.Server;
app.use(helmet())
app.use(bodyParser.json());

// Start DB then Express then Mocha callback
(async () => {
	await mongoInit();
	expressServer = await app.listen(port);
	if (mocha_callback) {
		mocha_callback();
	}
})()

app.use('/auth', async (req: Request, res: Response, next: NextFunction) => {
	const { email } = req.body;
	const user = await users.findOne({email: req.body.email});
	const valid_until = req.body.valid_until;
	const isValid = sodium.crypto_auth_verify(from_base64(req.body.mac), valid_until, user['signing_key'].buffer);
	if (!isValid || (Date.now() > parseInt(valid_until))) {
		res.send({error: 'invalid'});
	} else {
		next();
	}
});

// app.post('/auth/delete', (req: Request, res: Response) => {
// 	stripe.customers.del(customer.id).catch((err) => console.log('Customer deletion error:\n',
// 		(({ rawType, code, param, message, detail }) => ({ rawType, code, param, message, detail }))(err)));
// 	res.send();
// });

app.post('/auth/test', async (req: Request, res: Response) => {
	const { email } = req.body;
	const user = await users.findOne({ email });
	res.send(generateTokenDict(user['signing_key'].buffer));
});

app.post('/auth/refresh_auth_key', async (req: Request, res: Response) => {
	const { email } = req.body;
	const user = await users.findOneAndUpdate( { email }, {
		$set: {
			signing_key: Buffer.from(sodium.crypto_auth_keygen())
		}
	});
	res.send({ message: 'invalid' });
});

const signupSchema = joi.object().keys({
    password: joi.string().zxcvbn(3).required(),
    source: joi.string().required(),
    email: joi.string().email().required()
});

app.post('/signup', async (req: Request, res: Response) => {
	const validation = signupSchema.validate(req.body)
	if (validation.error) {
		handleError(req, res, validation.error.name, validation.error.message );
		return;
	}

	const { email, password, source } = validation.value;
	let user = await users.findOne({ email });
	if (user) {
		handleError(req, res, 'DuplicateUserError', 'User already exists')
		return;
	}

	let customer: Customer;
	try {
		logMessage(req, 'Awaiting customer creation');
		customer = await stripe.customers.create({ source, email });
	} catch (err) {
		handleError(req, res, err.type, err.message);
	 	return;
	}
	const card = customer.sources.data.find (
		source => source.id === customer.default_source
	) as ICard;
	logMessage(req, `Successful signup with username [${email}]`);
	const confirmation_key = to_base64(sodium.crypto_auth_keygen());
	const signing_key = Buffer.from(sodium.crypto_auth_keygen());
	try {
		const pwhash = sodium.crypto_pwhash_str(
	 		req.body.password,
		 	sodium.crypto_pwhash_OPSLIMIT_SENSITIVE,
			sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE);
		await users.insertOne({
			email, signing_key, confirmation_key, pwhash,
			stripe_id: customer.id,
			brand: card.brand,
			last4: card.last4,
			exp_year: card.exp_year,
			exp_month: card.exp_month
		});
	} catch (err) {
		res.status(400).json(distillError(err));
		return;
	}
	const data = {
	  from: 'RhythMandala <signups@rhythmandala.com>',
	  to: email,
	  subject: 'Follow Link to Complete Signup',
	  html: `${emailBody1}email=${email}&key=${confirmation_key}${emailBody2}`
	};
	const mg_response = await mailgun.messages().send(data);
	console.log(mg_response);
	res.send(generateTokenDict(signing_key));
});


				// await stripe.customers.del(customer.id);
		// 	} catch (err) {
		// 		console.error('SIGNUP: Customer deletion error:\n', distillError(err));
		// 	}
		// }
		

const confirmEmailSchema = joi.object().keys({ // how to make sure only these two are included
	email: joi.string().required(),
	key: joi.string().required()
})

app.post('/confirm_email', async function(req: Request, res: Response) {
	// Joi validation
	const validation = confirmEmailSchema.validate(req.body)
	if (validation.error) {
		handleError(req, res, validation.error.name, validation.error.message );
		return;
	}

	const handleConfError = () => { // don't let on if an email exists
		handleError(req, res, 'EmailConfirmationError', `There was an error confirming ${email}`)
	}

	// Check if user exists
	const { email, key } = validation.value;
	const user = await users.findOne({email});
	if (!user) {
		handleConfError();
		console.log( 'MissingUserError', `User ${email} does not exist`)
	 	return;
	}

	// Check if user is already confirmed
	if (!user.confirmation_key) {
		handleConfError();
		console.log( 'UserAlreadyConfirmedError', 'User is already confirmed');
		return;
	}

	// Check if key is correct
	if (key != user['confirmation_key']) {
		handleConfError();
		console.log('ConfirmationKeyError', `Key does not match`);
		return;
	}

	// Update DB
	await users.findOneAndUpdate({email: email}, { $unset: { confirmation_key: ''}});
	console.log(`EMAIL_CONFIRMATION_SUCCESSFUL: with email [${email}]`);

	// Create Stripe subscription
	console.log('Awaiting subscription creation');
	let subscription;
	try {
		subscription = await stripe.subscriptions.create({
			customer: user.stripe_id,
			items: [{ plan: 'plan_DrPVwslmSpiOT4' }]
		});
	} catch (err) {
		res.send();
		handleError(req, null, err.type, err.message);
	 	return;
	}

	res.send();
});

app.post('/login', async function (req: Request, res: Response) {
	const user = await users.findOne({email: req.body.email});
	const isValid = sodium.crypto_pwhash_str_verify(user['pwhash'], req.body.password);
	const email = req.body.email;
	if (isValid) {
		const dict = generateTokenDict(user['signing_key'].buffer);
		console.log(`LOGIN_SUCCESSFUL: with username [${email}]`);
		res.send( dict );
	} else {
		console.log(`LOGIN_FAILED: with username [${email}]`);
		res.send( { error: 'Login error' });
	}
});

const generateTokenDict = (key: Buffer) => {
	const valid_until = (Date.now() + token_window).toString();
	const mac = sodium.crypto_auth(valid_until, key);
	return ({ mac: to_base64(mac), valid_until: valid_until});
};

const from_base64 = (bytes: string) => {
	return sodium.from_base64(bytes, sodium.base64_variants.URLSAFE_NO_PADDING )
}

const to_base64 = (bytes: Uint8Array) => {
	return sodium.to_base64(bytes, sodium.base64_variants.URLSAFE_NO_PADDING )
}

const handleError = (req: Request, res: Response, code: String, message: String) => {
	const path = req.url.toUpperCase();
	logMessage(req, `${ code }: ${ message }`);
	if (res) {
		res.status(400).json({ code, message });
	}
}

const logMessage = (req: Request, message: String) => {
	console.log(`${ req.url.toUpperCase() }: ${ message }` );
}

// function distillError(error: IStripeError) {
// 	return (({ code, message, param, type }) => ({ code, message, param, type }))(error)
// }

function distillError(error: any) {
	delete error.stack;
	return error;
}

function close() {
	server.close();
	expressServer.close();
}

function getUsers () {
	return users;
}

let mocha_callback: () => {};

function setMochaCallback(callback: () => {}) {
	 mocha_callback = callback;
}

module.exports = { app, setMochaCallback, close, getUsers }
