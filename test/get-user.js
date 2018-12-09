const chai = require("chai");
const chaiHttp = require("chai-http");
const app = require("../dist/app");
const should = chai.should();
const nock = require("nock");
const sinon = require("sinon");
const qs = require("querystring").stringify;

const email = "justinfrancos@gmail.com";
const password = "ifthisislongenoughdictionarywordsarefine";
const token = "tok_visa_debit";

const server = app.app;
const twoWeeks = 1209600000;
const signup = "/signup"
const confirmEmail = "/new-session/confirm_email"

chai.use(chaiHttp);

process.on("uncaughtException", err => {
	fs.writeSync(1, `Caught exception: ${err}\n`);
});

let users;

before(() => (users = app.getUsers())); // This depends on mochaInit.js to work

describe("-- Get user --", () => {
	describe("- Get user -", () => {
		it("Should return user", async () => {
			// Setup
			const clock = sinon.useFakeTimers((new Date()).getTime() - twoWeeks + 10000);
			const agent = chai.request.agent(server);
			let res = await agent
				.post(signup)
				.send({ email, password, source: token });

			const user = await users.findOne({ email });
			const key = user.confirmationKey;
			res = await agent.post(confirmEmail).send({ key, email });

			clock.restore();
			res = await agent.post("/session/get_user");
			res.should.have.status(200);

			users.drop();
			agent.close();
		}).timeout(6000);
	});

	describe("- Get user after cookie expires -", () => {
		it("Should not return user", async () => {
			// Setup
			const clock = sinon.useFakeTimers((new Date()).getTime() - twoWeeks - 1000);
			const agent = chai.request.agent(server);
			let res = await agent
				.post(signup)
				.send({ email, password, source: token });

			const user = await users.findOne({ email });
			const key = user.confirmationKey;
			res = await agent.post(confirmEmail).send({ key, email });
			console.log('here')

			clock.restore();
			console.log('there')

			res = await agent.post("/session/get_user");
			res.should.have.status(401);

			users.drop();
			agent.close();
		}).timeout(6000);
	});
	describe("- Willy nilly call get_user -", () => {
		it("Should not return user", async () => {
			// Setup
			const agent = chai.request.agent(server);

			res = await agent.post("/session/get_user");
			res.should.have.status(401);
			console.log("get here")

			// users.drop();
			agent.close();
		}).timeout(6000);
	});
});
