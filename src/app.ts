
import assert from 'assert';
import bodyParser from 'body-parser';
import express, { Request, Response, NextFunction, Application } from "express";
import helmet from 'helmet';
import joi from 'joi';
import mailgun from 'mailgun-js';
import mongodb from 'mongodb';
//var nock = require('nock');
const sodium = require('sodium');
import Stripe, { IStripeError } from 'stripe';
import zxcvbn from 'zxcvbn';

const stripe = new Stripe("sk_test_4vUzfLsfzZ7ffojQgISR1ntd");
const url = 'mongodb://localhost:27017';
const token_window = 60000;
const port = process.env.PORT || 3000;
const plan = 'plan_DrPVwslmSpiOT4';
const app: express.Application = express();
let users: mongodb.Collection;

(async () => {
	const server = await mongodb.connect(url, { useNewUrlParser: true });
	const db = server.db('rhythmandala');
	users = await db.collection('users');
})();

const generateKey = (len: number) => {
  const key = Buffer.allocUnsafe(len);
  sodium.api.randombytes_buf(key, len);
  return key;
};

const generateTokenDict = (key: string) => {
	const auth = new sodium.Auth(key);
	const valid_until = (Date.now() + token_window).toString()
	const mac = auth.generate(valid_until).toString('base64');
	return ({ mac: mac, valid_until: valid_until});
};

let sibling_key = generateKey(16);

app.use(helmet())
app.use(bodyParser.json());

app.use('/auth', async (req: Request, res: Response, next: NextFunction) => {
	const email = req.body.email;
	const user = await users.findOne({email: req.body.email});
	const auth = new sodium.Auth(user['key'].buffer);
	const mac = Buffer.from(req.body.mac, 'base64');
	const valid_until = req.body.valid_until;
	const isValid = auth.validate(mac, valid_until);
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
	const email = req.body.email;
	const user = await users.findOne({email: req.body.email});
	res.send(generateTokenDict(user['key'].buffer));
});

app.post('/auth/refresh_auth_key', async (req: Request, res: Response) => {
	const email = req.body.email;
	const user = await users.findOneAndUpdate({email: req.body.email}, {$set: {key: generateKey(32)}});
	res.send({ message: 'invalid' });
});

app.post('/signup', async (req: Request, res: Response) => {
	const validation = signup_schema.validate(req.body)
	if (validation.error) {
		console.log('validation error', validation.error.details[0].message);
		res.send({error: 'validation_error'});
		return;
	}
	const { email, password, stripe_token } = req.body;
	const score = zxcvbn(password).score;
	if (score < 3) {
		console.log(`SIGNUP_WEAK_PASSWORD: signup attempted with email [${email}] and a password with a score of ${score}/4`)
		res.send({ error: 'Your proposed password is too weak.  <a href="https://xkpasswd.net">Consider using this tool to generate a secure, memorable password.</a>' })
		return;
	}
	const customer = await stripe.customers.create({
		source: stripe_token,
		email
	})
	.catch((err: IStripeError) => console.log("Customer creation error:\n", (({ code, param, message }) => ({  code, param, message }))(err)));
	if (!customer) {
		console.log(`SIGNUP_STRIPE_CUSTOMER_NOT_CREATED`);
		res.send({ error: "CUSTOMER_NOT_CREATED" });
		return;
	}
	const subscription = await stripe.subscriptions.create({
		customer: customer.id,
		items: [{ plan: 'plan_DrPVwslmSpiOT4' }]
	}).catch((err: IStripeError) => console.log("Subscription creation error:\n", { code: err.code, param: err.param, message: err.message } ));
	if (!subscription) {
		console.log(`SIGNUP_STRIPE_SUBSCRIPTION_NOT_CREATED`);
		stripe.customers.del(customer.id).catch((err: IStripeError) => console.log('Customer deletion error:\n',
			(({ code, param, message }) => ({ code, param, message }))(err)));
		res.send({ error: "SUBSCRIPTION_NOT_CREATED" });
		return;
	}
	console.log(`SIGNUP_SUCCESSFUL: with username [${email}] and password score ${score}/4`)
	const hash = sodium.api.crypto_pwhash_str(
 		Buffer.from(req.body.password),
	 	sodium.api.crypto_pwhash_OPSLIMIT_SENSITIVE,
		sodium.api.crypto_pwhash_MEMLIMIT_INTERACTIVE);
	users.insertOne({email: email, pwhash: hash, stripe_cust: customer.id, key: generateKey(32)});
	const user = await users.find({email: email}).toArray();
	res.send();
});

app.post('/login', async function (req: Request, res: Response) {
	const user = await users.findOne({email: req.body.email});
	const isValid = sodium.api.crypto_pwhash_str_verify(user['pwhash'].buffer, Buffer.from(req.body.password));
	const email = req.body.email;
	if (isValid) {
		const auth = new sodium.Auth(user['key'].buffer);
		const valid_until = (Date.now() + token_window).toString();
		const mac = auth.generate(valid_until);
		console.log(`LOGIN_SUCCESSFUL: with username [${email}]`);
		res.send( { valid_until: valid_until, mac: mac.toString('base64') } );
	} else {
		console.log(`LOGIN_FAILED: with username [${email}]`);
		res.send( { error: 'Login error' });
	}
});

const signup_schema = joi.object().keys({
    password: joi.string().required(),
    stripe_token: joi.string().required(),
    email: joi.string().email().required()
});

module.exports = app.listen(port, function () {
  console.log(`Example app listening on port ${port}!`);
});