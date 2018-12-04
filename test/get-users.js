const chai = require("chai");
const chaiHttp = require("chai-http");
const app = require("../dist/app");
const should = chai.should();
const nock = require("nock");
const qs = require("querystring").stringify;

const email = "justinfrancos@gmail.com";
const password = "ifthisislongenoughdictionarywordsarefine";
const token = "tok_visa_debit";

const server = app.app

chai.use(chaiHttp);

const agent = chai.request.agent(server)

process.on('uncaughtException', (err) => {
  fs.writeSync(1, `Caught exception: ${err}\n`);
});

let users;

before (() => users = app.getUsers()); // This depends on mochaInit.js to work

describe("-- Confirming a newly created account with valid parameters --", () => {
	it("Should return 200", async () => {
		// Setup
		let res = await agent
			.post("/user/signup")
			.send({ email, password, source: token });

		let user = await users.findOne({ email });
		const key = user.confirmation_key;
		res = await agent
			.post("/confirm_email")
			.send({ key, email });

		res = await agent
			.post("/user/get_user");
		console.log(res.body)

		users.drop();
		agent.close();
	}).timeout(6000);
})
