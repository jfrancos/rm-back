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
const joiZxcvbn = require('joi-zxcvbn');
const mailgun_js_1 = __importDefault(require("mailgun-js"));
const mongodb_1 = __importDefault(require("mongodb"));
const libsodium_wrappers_sumo_1 = __importDefault(require("libsodium-wrappers-sumo"));
const stripe_1 = __importDefault(require("stripe"));
const domain = 'mg.rhythmandala.com';
const apiKey = 'key-3c12a1a4a66379e3a57c2da935b91141';
const mailgun = new mailgun_js_1.default({ apiKey, domain });
const stripe = new stripe_1.default("sk_test_4vUzfLsfzZ7ffojQgISR1ntd");
const url = 'mongodb://localhost:27017';
const token_window = 60000;
const port = process.env.PORT || 3000;
const plan = 'plan_DrPVwslmSpiOT4';
const app = express_1.default();
const joi = joi_1.default.extend(joiZxcvbn(joi_1.default));
let users;
app.use(helmet_1.default());
app.use(body_parser_1.default.json());
let server;
(() => __awaiter(this, void 0, void 0, function* () {
    server = yield mongodb_1.default.connect(url, { useNewUrlParser: true });
    const db = server.db('rhythmandala');
    users = yield db.collection('users');
}))();
app.use('/auth', (req, res, next) => __awaiter(this, void 0, void 0, function* () {
    const { email } = req.body;
    const user = yield users.findOne({ email: req.body.email });
    const valid_until = req.body.valid_until;
    const isValid = libsodium_wrappers_sumo_1.default.crypto_auth_verify(from_base64(req.body.mac), valid_until, from_base64(user['signing_key']));
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
    res.send(generateTokenDict(user['signing_key']));
}));
app.post('/auth/refresh_auth_key', (req, res) => __awaiter(this, void 0, void 0, function* () {
    const email = req.body.email;
    const user = yield users.findOneAndUpdate({ email: req.body.email }, { $set: { signing_key: to_base64(libsodium_wrappers_sumo_1.default.crypto_auth_keygen()) } });
    res.send({ message: 'invalid' });
}));
app.post('/signup', (req, res) => __awaiter(this, void 0, void 0, function* () {
    const validation = signup_schema.validate(req.body);
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
    let customer, subscription;
    try {
        console.log('Awaiting customer creation');
        customer = yield stripe.customers.create({ source, email });
        console.log('Awaiting subscription creation');
        subscription = yield stripe.subscriptions.create({
            customer: customer.id,
            items: [{ plan: 'plan_DrPVwslmSpiOT4' }]
        });
    }
    catch (err) {
        const error = distillError(err);
        if (!customer) {
            console.error(`SIGNUP: Error creating customer [${email}]:\n`, error);
        }
        else {
            console.error(`SIGNUP: Error creating subscription for [${email}]):\n`, error);
            try {
                yield stripe.customers.del(customer.id);
            }
            catch (err) {
                console.error('SIGNUP: Customer deletion error:\n', distillError(err));
            }
        }
        res.status(400).json(error);
        return;
    }
    const card = customer.sources.data.find(source => source.id === customer.default_source);
    console.log(`SIGNUP_SUCCESSFUL: with username [${email}]`);
    const hash = libsodium_wrappers_sumo_1.default.crypto_pwhash_str(req.body.password, libsodium_wrappers_sumo_1.default.crypto_pwhash_OPSLIMIT_SENSITIVE, libsodium_wrappers_sumo_1.default.crypto_pwhash_MEMLIMIT_INTERACTIVE);
    const confirmation_key = to_base64(libsodium_wrappers_sumo_1.default.crypto_auth_keygen());
    const user = yield users.insertOne({
        email: email,
        pwhash: hash,
        stripe_cust: customer.id,
        signing_key: to_base64(libsodium_wrappers_sumo_1.default.crypto_auth_keygen()),
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
        text: 'Thank you for signing up for RhythMandala!\n' + confirmation_key //.toString('base64')
    };
    mailgun.messages().send(data, function (error, body) {
        console.log(body);
    });
    res.send();
}));
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
app.post('/login', function (req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const user = yield users.findOne({ email: req.body.email });
        const isValid = libsodium_wrappers_sumo_1.default.crypto_pwhash_str_verify(user['pwhash'], req.body.password);
        const email = req.body.email;
        if (isValid) {
            const dict = generateTokenDict(user['signing_key']);
            console.log(`LOGIN_SUCCESSFUL: with username [${email}]`);
            res.send(dict);
        }
        else {
            console.log(`LOGIN_FAILED: with username [${email}]`);
            res.send({ error: 'Login error' });
        }
    });
});
const signup_schema = joi.object().keys({
    password: joi.string().zxcvbn(3).required(),
    source: joi.string().required(),
    email: joi.string().email().required()
});
const confirm_email_schema = joi.object().keys({
    email: joi.string().email().required(),
    key: joi.string().required()
});
const generateTokenDict = (key) => {
    const valid_until = (Date.now() + token_window).toString();
    const mac = libsodium_wrappers_sumo_1.default.crypto_auth(valid_until, from_base64(key));
    return ({ mac: to_base64(mac), valid_until: valid_until });
};
const from_base64 = (bytes) => {
    return libsodium_wrappers_sumo_1.default.from_base64(bytes, libsodium_wrappers_sumo_1.default.base64_variants.URLSAFE_NO_PADDING);
};
const to_base64 = (bytes) => {
    return libsodium_wrappers_sumo_1.default.to_base64(bytes, libsodium_wrappers_sumo_1.default.base64_variants.URLSAFE_NO_PADDING);
};
function distillError(error) {
    return (({ code, message, param, type }) => ({ code, message, param, type }))(error);
}
module.exports = { app: app.listen(port, function () {
        console.log(`Example app listening on port ${port}!`);
    }) };
//# sourceMappingURL=app.js.map