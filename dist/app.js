"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const body_parser_1 = __importDefault(require("body-parser"));
const express_1 = __importDefault(require("express"));
const helmet_1 = __importDefault(require("helmet"));
const joi_1 = __importDefault(require("joi"));
const mongodb_1 = __importDefault(require("mongodb"));
//var nock = require('nock');
const sodium = require('sodium');
const stripe_1 = __importDefault(require("stripe"));
const zxcvbn_1 = __importDefault(require("zxcvbn"));
const stripe = new stripe_1.default("sk_test_4vUzfLsfzZ7ffojQgISR1ntd");
const url = 'mongodb://localhost:27017';
const token_window = 60000;
const port = process.env.PORT || 3000;
const plan = 'plan_DrPVwslmSpiOT4';
const app = express_1.default();
let users;
(() => __awaiter(this, void 0, void 0, function* () {
    const server = yield mongodb_1.default.connect(url, { useNewUrlParser: true });
    const db = server.db('rhythmandala');
    users = yield db.collection('users');
}))();
const generateKey = (len) => {
    const key = Buffer.allocUnsafe(len);
    sodium.api.randombytes_buf(key, len);
    return key;
};
const generateTokenDict = (key) => {
    const auth = new sodium.Auth(key);
    const valid_until = (Date.now() + token_window).toString();
    const mac = auth.generate(valid_until).toString('base64');
    return ({ mac: mac, valid_until: valid_until });
};
let sibling_key = generateKey(16);
app.use(helmet_1.default());
app.use(body_parser_1.default.json());
app.use('/auth', (req, res, next) => __awaiter(this, void 0, void 0, function* () {
    const email = req.body.email;
    const user = yield users.findOne({ email: req.body.email });
    const auth = new sodium.Auth(user['key'].buffer);
    const mac = Buffer.from(req.body.mac, 'base64');
    const valid_until = req.body.valid_until;
    const isValid = auth.validate(mac, valid_until);
    if (!isValid || (Date.now() > parseInt(valid_until))) {
        res.send({ error: 'invalid' });
    }
    else {
        next();
    }
}));
// app.post('/auth/delete', (req: Request, res: Response) => {
// 	stripe.customers.del(customer.id).catch((err) => console.log('Customer deletion error:\n',
// 		(({ rawType, code, param, message, detail }) => ({ rawType, code, param, message, detail }))(err)));
// 	res.send();
// });
app.post('/auth/test', (req, res) => __awaiter(this, void 0, void 0, function* () {
    const email = req.body.email;
    const user = yield users.findOne({ email: req.body.email });
    res.send(generateTokenDict(user['key'].buffer));
}));
app.post('/auth/refresh_auth_key', (req, res) => __awaiter(this, void 0, void 0, function* () {
    const email = req.body.email;
    const user = yield users.findOneAndUpdate({ email: req.body.email }, { $set: { key: generateKey(32) } });
    res.send({ message: 'invalid' });
}));
app.post('/signup', (req, res) => __awaiter(this, void 0, void 0, function* () {
    const validation = signup_schema.validate(req.body);
    if (validation.error) {
        console.log('validation error', validation.error.details[0].message);
        res.send({ error: 'validation_error' });
        return;
    }
    const { email, password, stripe_token } = req.body;
    const score = zxcvbn_1.default(password).score;
    if (score < 3) {
        console.log(`SIGNUP_WEAK_PASSWORD: signup attempted with email [${email}] and a password with a score of ${score}/4`);
        res.send({ error: 'Your proposed password is too weak.  <a href="https://xkpasswd.net">Consider using this tool to generate a secure, memorable password.</a>' });
        return;
    }
    let customer, subscription;
    try {
        customer = yield stripe.customers.create({
            source: stripe_token, email
        });
        //	console.log('Stripe customer created');
        const subscription = yield stripe.subscriptions.create({
            customer: customer.id,
            items: [{ plan: 'plan_DrPVwslmSpiOT4' }]
        });
    }
    catch (err) {
        console.log(err);
        //	console.log("Customer creation error:\n", (({ code, param, message }) => ({  code, param, message }))(err));
        //	console.log(`SIGNUP_STRIPE_CUSTOMER_NOT_CREATED`);
        if (customer && !subscription) {
            stripe.customers.del(customer.id).catch((err) => console.log('Customer deletion error:\n', (({ code, param, message }) => ({ code, param, message }))(err)));
        }
        res.send({ error: "SIGNUP_ERROR" });
        return;
    }
    //	.catch((err: IStripeError) => console.log("Subscription creation error:\n", { code: err.code, param: err.param, message: err.message } ));
    // if (!subscription) {
    // 	console.log(`SIGNUP_STRIPE_SUBSCRIPTION_NOT_CREATED`);
    // 	stripe.customers.del(customer.id).catch((err: IStripeError) => console.log('Customer deletion error:\n',
    // 		(({ code, param, message }) => ({ code, param, message }))(err)));
    // 	res.send({ error: "SUBSCRIPTION_NOT_CREATED" });
    // 	return;
    //	}
    //	console.log(`SIGNUP_SUCCESSFUL: with username [${email}] and password score ${score}/4`)
    const hash = sodium.api.crypto_pwhash_str(Buffer.from(req.body.password), sodium.api.crypto_pwhash_OPSLIMIT_SENSITIVE, sodium.api.crypto_pwhash_MEMLIMIT_INTERACTIVE);
    users.insertOne({ email: email, pwhash: hash, stripe_cust: customer.id, key: generateKey(32) });
    const user = yield users.find({ email: email }).toArray();
    res.send();
}));
app.post('/login', function (req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const user = yield users.findOne({ email: req.body.email });
        const isValid = sodium.api.crypto_pwhash_str_verify(user['pwhash'].buffer, Buffer.from(req.body.password));
        const email = req.body.email;
        if (isValid) {
            const auth = new sodium.Auth(user['key'].buffer);
            const valid_until = (Date.now() + token_window).toString();
            const mac = auth.generate(valid_until);
            console.log(`LOGIN_SUCCESSFUL: with username [${email}]`);
            res.send({ valid_until: valid_until, mac: mac.toString('base64') });
        }
        else {
            console.log(`LOGIN_FAILED: with username [${email}]`);
            res.send({ error: 'Login error' });
        }
    });
});
const signup_schema = joi_1.default.object().keys({
    password: joi_1.default.string().required(),
    stripe_token: joi_1.default.string().required(),
    email: joi_1.default.string().email().required()
});
module.exports = app.listen(port, function () {
    console.log(`Example app listening on port ${port}!`);
});
//# sourceMappingURL=app.js.map