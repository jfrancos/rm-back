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
const pwhash = "$argon2id$v=19$m=65536,t=4,p=1$VUnpyWRaGSkJRO5So4WfLg$SWBQIezrpoyFN6MNCytfge8enId3FcY/sm/H/Yd+g9U";

const server = app.app;
const twoWeeks = 1209600000;
const signup = "/signup"
const confirmEmail = "/confirm-email"
const login = "/login"

chai.use(chaiHttp);

let users;

before(() => (users = app.getUsers())); // This depends on mochaInit.js to work

describe("-- Get user --", () => {
	describe("- Get user -", () => {
		it("Should return user", async () => {
			const agent = chai.request.agent(server);
			await users.insertOne({
				email,
				pwhash,
			});
			await agent.post(login).send({ email, password });
			
			const res = await agent.post("/get-user");
			res.should.have.status(200);

			users.drop();
			agent.close();
		});
	});

	describe("- Get user with extra parameter -", () => {
		it("Should return user", async () => {
			const agent = chai.request.agent(server);
			await users.insertOne({
				email,
				pwhash,
			});
			await agent.post(login).send({ email, password });
			
			const res = await agent.post("/get-user").send({ extra: "extra" });
			res.should.have.status(400);

			users.drop();
			agent.close();
		});
	});

	describe("- Get user after cookie expires -", () => {
		it("Should not return user", async () => {
			// Setup
			const clock = sinon.useFakeTimers((new Date()).getTime() - twoWeeks - 1000);
			const agent = chai.request.agent(server);
			await users.insertOne({
				email,
				pwhash,
			});
			await agent.post(login).send({ email, password });
			clock.restore();

			res = await agent.post("/get-user");
			console.log(res.body)
			res.should.have.status(401);

			users.drop();
			agent.close();
		});
	});

	describe("- Willy nilly call get_user -", () => {
		it("Should not return user", async () => {
			// Setup
			const agent = chai.request.agent(server);

			res = await agent.post("/get-user");
			res.should.have.status(401);
			// console.log(res)

			agent.close();
		});
	});
});
