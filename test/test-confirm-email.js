const chai = require("chai");
const chaiHttp = require("chai-http");
const server = require("../dist/app").app; // to make api calls
const close = require("../dist/app").close; // to close mongo and express server
const should = chai.should();
const nock = require("nock");
const qs = require("querystring").stringify;
require('./mochaInit')
const email = "justinfrancos@gmail.com";
const password = "ifthisislongenoughdictionarywordsarefine";
const token = "tok_visa_debit";

chai.use(chaiHttp);

const getUsers = require("../dist/app").getUsers;
let users;

before (() => users = getUsers()); // This depends on mochaInit.js to work

after(close);

const handleError = res =>
	console.log(`MOCHA/CHAI: ${res.body.code}: ${res.body.message}`);

describe("--- TESTING EMAIL CONFIRMATION ---", () => {
	describe("-- Confirming a newly created account with correct parameters --", () => {
		it("Should remove the email confirmation field and return a token", async () => {
			// Setup
			await users.insertOne({
				email: "justinfrancos@gmail.com",
				confirmation_key: "confirmation_key"
			});

			// Exercise
			res = await chai
				.request(server)
				.post("/confirm_email")
				.send({ key: "confirmation_key", email: email });

			// Verify
			const user = await users.findOne({
				email: "justinfrancos@gmail.com"
			});
			user.should.not.contain.key("confirmation_key");
			console.log(user);

			// Teardown
			users.drop();
		});
	});
});
