
import 'reflect-metadata';
import Stripe, { IStripeError } from 'stripe';
import bodyParser from 'body-parser';
import express, { Request, Response, NextFunction, Application } from "express";
import helmet from 'helmet';
import joi from 'joi';
import mailgun from 'mailgun-js';
const sodium = require('sodium');
import zxcvbn from 'zxcvbn';

const stripe = new Stripe("sk_test_4vUzfLsfzZ7ffojQgISR1ntd");

const generateKey = (len: number) => {
  const key = Buffer.allocUnsafe(len);
  sodium.api.randombytes_buf(key, len);
  return key;
};

const generateTokenDict = () => {
	const key = Buffer.concat([sibling_key, user_key]);
	const auth = new sodium.Auth(key);
	const valid_until = (Date.now() + token_window).toString()
	const mac = auth.generate(valid_until).toString('base64');
	return ({ mac: mac, valid_until: valid_until});
};

const token_window = 60000;
const port = process.env.PORT || 3000;
const app: express.Application = express();
const plan = 'plan_DrPVwslmSpiOT4'

let sibling_key = generateKey(16);
let customer: Stripe.customers.ICustomer;

app.use(helmet())
app.use(bodyParser.json());
let hash: string, user_key: Uint8Array;

app.use('/auth', (req: Request, res: Response, next: NextFunction) => {
	const key = Buffer.concat([sibling_key, user_key]);
	const auth = new sodium.Auth(key);
	const mac = Buffer.from(req.body.mac, 'base64');
	const valid_until = req.body.valid_until;
	const isValid = auth.validate(mac, valid_until);
	if (!isValid || (Date.now() > parseInt(valid_until))) {
		res.send({error: 'invalid'});
	} else {
		next();
	}
});

app.post('/auth/delete', (req: Request, res: Response) => {
	stripe.customers.del(customer.id).catch((err) => console.log('Customer deletion error:\n',
		(({ rawType, code, param, message, detail }) => ({ rawType, code, param, message, detail }))(err)));
	res.send();
});

app.post('/auth/test', (req: Request, res: Response) => {
	res.send(generateTokenDict());
});

app.post('/auth/refresh_auth_key', (req: Request, res: Response) => {
	user_key = generateKey(16);
	res.send({ message: 'invalid' });
});

app.post('/signup', async (req: Request, res: Response) => {
	customer = null;
	const validation = signup_schema.validate(req.body)
	if (validation.error) {
		console.log('validation error', validation.error.details[0].message);
		res.send({error: 'validation_error'});
		return;
	}
	const email = req.body.email;
	const password = req.body.password;
	const stripe_token = req.body.stripe_token;
	const score = zxcvbn(req.body.password).score;
	if (score < 3) {
		console.log(`SIGNUP_WEAK_PASSWORD: signup attempted with email [${email}] and a password with a score of ${score}/4`)
		res.send({ error: 'Your proposed password is too weak.  <a href="https://xkpasswd.net">Consider using this tool to generate a secure, memorable password.</a>' })
		return;
	}
	await stripe.customers.create({
		source: stripe_token,
		email: email
	})
	.then((cust) => customer = cust)
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
			(({  code, param, message }) => ({ code, param, message  }))(err)));
		res.send({ error: "SUBSCRIPTION_NOT_CREATED" });
		return;
	}
	console.log(`SIGNUP_SUCCESSFUL: with username [${email}] and password score ${score}/4`)
	hash = sodium.api.crypto_pwhash_str(
 		Buffer.from(req.body.password),
	 	sodium.api.crypto_pwhash_OPSLIMIT_SENSITIVE,
		sodium.api.crypto_pwhash_MEMLIMIT_INTERACTIVE);
	user_key = generateKey(16);
	res.send();
});

app.post('/login', function (req: Request, res: Response) {
	const isValid = sodium.api.crypto_pwhash_str_verify(hash, Buffer.from(req.body.password));
	const username = req.body.username;
	if (isValid) {
		const key = Buffer.concat([sibling_key, user_key]);
		const auth = new sodium.Auth(key);
		const valid_until = (Date.now() + token_window).toString()
		const mac = auth.generate(valid_until);
		console.log(`LOGIN_SUCCESSFUL: with username [${username}]`);
		res.send( { valid_until: valid_until, mac: mac.toString('base64') } );
	} else {
		console.log(`LOGIN_FAILED: with username [${username}]`);
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