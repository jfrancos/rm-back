
import assert from 'assert';
import bodyParser from 'body-parser';
import express, { Request, Response, NextFunction, Application } from "express";
import helmet from 'helmet';
import plainJoi from 'joi';
const joiZxcvbn = require('joi-zxcvbn');
import Mailgun from 'mailgun-js';
import mongodb from 'mongodb';
const sodium = require('sodium');
import _sodium from 'libsodium-wrappers';
import Stripe, { IStripeError, customers, subscriptions, ICard } from 'stripe';
import zxcvbn from 'zxcvbn';

const domain = 'mg.rhythmandala.com'
const apiKey = 'key-3c12a1a4a66379e3a57c2da935b91141'

type Customer = customers.ICustomer;
type Subscription = subscriptions.ISubscription;

const mailgun = new Mailgun({apiKey, domain});
const stripe = new Stripe("sk_test_4vUzfLsfzZ7ffojQgISR1ntd");
const url = 'mongodb://localhost:27017';
const token_window = 60000;
const port = process.env.PORT || 3000;
const plan = 'plan_DrPVwslmSpiOT4';
const app: express.Application = express();
const joi = plainJoi.extend(joiZxcvbn(plainJoi));
let users: mongodb.Collection;

app.use(helmet())
app.use(bodyParser.json());

declare function run(): void;


let server

(async () => {
	server = await mongodb.connect(url, { useNewUrlParser: true });
	const db = server.db('rhythmandala');
	users = await db.collection('users');
})();

app.use('/auth', async (req: Request, res: Response, next: NextFunction) => {
	const { email } = req.body;
	const user = await users.findOne({email: req.body.email});
	// const auth = new (user['signing_key'], 'base64');
	// const mac = Buffer.from(req.body.mac, 'base64');
	const valid_until = req.body.valid_until;
	// const isValid = auth.validate(mac, valid_until);
		console.log('made it ')
	console.log(req.body.mac)
	console.log(user['signing_key']);
	try {
	const isValid = _sodium.crypto_auth_verify(from_base64(req.body.mac), valid_until, from_base64(user['signing_key']));
	if (!isValid || (Date.now() > parseInt(valid_until))) {
		res.send({error: 'invalid'});
	} else {
		next();
	}
} catch (err) {
	console.log(err)
}
});

// app.post('/auth/delete', (req: Request, res: Response) => {
// 	stripe.customers.del(customer.id).catch((err) => console.log('Customer deletion error:\n',
// 		(({ rawType, code, param, message, detail }) => ({ rawType, code, param, message, detail }))(err)));
// 	res.send();
// });

app.post('/auth/test', async (req: Request, res: Response) => {
	const email = req.body.email;
	const user = await users.findOne({email: req.body.email});
	res.send(generateTokenDict(user['signing_key']));
});

app.post('/auth/refresh_auth_key', async (req: Request, res: Response) => {
	const email = req.body.email;
	const user = await users.findOneAndUpdate({email: req.body.email}, {$set: {signing_key: generateKey(32)}});
	res.send({ message: 'invalid' });
});

app.post('/signup', async (req: Request, res: Response) => {
	const validation = signup_schema.validate(req.body)
	if (validation.error) {
		console.error('SIGNUP: validation error', validation.error.details[0]);
		res.status(400).json(validation.error.details[0]);
		return;
	}
	const { email, password, source } = validation.value;
	//const user = await users.findOne({email: email});
	// if (user) {
	// 	res.status(400).json({ error: "user already exists"});
	// }
	let customer: Customer, subscription: Subscription;
	try {
		console.log('Awaiting customer creation');
		customer = await stripe.customers.create({ source, email });
		console.log('Awaiting subscription creation');
		subscription = await stripe.subscriptions.create({
			customer: customer.id,
			items: [{ plan: 'plan_DrPVwslmSpiOT4' }]
		});
	} catch (err) {
		const error = distillError(err)
		if (!customer) {
			console.error(`SIGNUP: Error creating customer [${email}]:\n`, error);
		} else {
			console.error(`SIGNUP: Error creating subscription for [${email}]):\n`, error)
			try {
				await stripe.customers.del(customer.id);
			} catch (err) {
				console.error('SIGNUP: Customer deletion error:\n', distillError(err));
			}
		}
		res.status(400).json(error);
	 	return;
	}
	const card = customer.sources.data.find(source => source.id === customer.default_source) as ICard
	console.log(`SIGNUP_SUCCESSFUL: with username [${email}]`)
	const hash = sodium.api.crypto_pwhash_str(
 		Buffer.from(req.body.password),
	 	sodium.api.crypto_pwhash_OPSLIMIT_SENSITIVE,
		sodium.api.crypto_pwhash_MEMLIMIT_INTERACTIVE);
	const confirmation_key = generateKey(32)
	const user = await users.insertOne({
		email: email,
		pwhash: hash,
		stripe_cust: customer.id,
		signing_key: generateKey(32),
		confirmation_key: confirmation_key,
		brand: card.brand,
		last4: card.last4,
		exp_year: card.exp_year,
		exp_month: card.exp_month
	});

	const data = {
	  from: 'RhythMandala <signups@rhythmandala.com>',
	  to: email,
	  subject: 'Complete Signup',
	  text: 'Thank you for signing up for RhythMandala!\n' + confirmation_key//.toString('base64')
	};

	mailgun.messages().send(data, function (error, body) {
	  console.log(body);
	});
	res.send();
});

// app.post('/confirm_email', async function(req: Request, res: Response) {
// 	const validation = confirm_email_schema.validate(req.body)
// 	if (validation.error) {
// 		console.error('SIGNUP: validation error', validation.error.details[0]);
// 		res.status(400).json(validation.error.details[0]);
// 		return;
// 	}
// 	const { email, key } = validation.value;
// 	const keyBuffer = Buffer.from(key, 'base64');
// 	const user = await users.findOne({email});
// 	if (keyBuffer.equals(user['confirmation_key'].buffer)) {
// 		await users.findOneAndUpdate({email: email}, { $unset: { confirmation_key: ''}});
// 		const auth = new sodium.Auth(user['key'].buffer);
// 		const valid_until = (Date.now() + token_window).toString();
// 		const mac = auth.generate(valid_until);
// 		console.log(`EMAIL_CONFIRMATION_SUCCESSFUL: with username [${email}]`);
// 		res.send( { valid_until: valid_until, mac: mac.toString('base64') } );
// 	} else {
// 		res.status(400).send();
// 	}
// })

app.post('/login', async function (req: Request, res: Response) {
	const user = await users.findOne({email: req.body.email});
	const isValid = sodium.api.crypto_pwhash_str_verify(user['pwhash'].buffer, Buffer.from(req.body.password));
	const email = req.body.email;
	if (isValid) {
		const dict = generateTokenDict(user['signing_key']);
		console.log(`LOGIN_SUCCESSFUL: with username [${email}]`);
		res.send( dict );
	} else {
		console.log(`LOGIN_FAILED: with username [${email}]`);
		res.send( { error: 'Login error' });
	}
});

const signup_schema = joi.object().keys({
    password: joi.string().zxcvbn(3).required(),
    source: joi.string().required(),
    email: joi.string().email().required()
});

const confirm_email_schema = joi.object().keys({
	email: joi.string().email().required(),
	key: joi.string().required()
})

const generateTokenDict = (key: string) => {
	const valid_until = (Date.now() + token_window).toString();
	const mac = _sodium.crypto_auth(valid_until, from_base64(key));
	return ({ mac: to_base64(mac), valid_until: valid_until});
};

const generateKey = (len: number) => {
  const key = to_base64(_sodium.randombytes_buf(len));
  return key;
};

const from_base64 = (bytes: string) => {
	return _sodium.from_base64(bytes, _sodium.base64_variants.URLSAFE_NO_PADDING )
}

const to_base64 = (bytes: Uint8Array) => {
	return _sodium.to_base64(bytes, _sodium.base64_variants.URLSAFE_NO_PADDING )
}

function distillError(error: IStripeError) {
	//console.log(error)
	return (({ code, message, param, type }) => ({ code, message, param, type }))(error)
}

 	module.exports = { app: app.listen(port, function () {
  console.log(`Example app listening on port ${port}!`);

})}
