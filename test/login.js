const chai = require("chai");
const chaiHttp = require("chai-http");
const app = require("../dist/app");
const should = chai.should();
const nock = require("nock");
const sinon = require("sinon");
const qs = require("querystring").stringify;

const email = "justinfrancos@gmail.com";
const password = "ifthisislongenoughdictionarywordsarefine";
const pwhash = "$argon2id$v=19$m=65536,t=4,p=1$VUnpyWRaGSkJRO5So4WfLg$SWBQIezrpoyFN6MNCytfge8enId3FcY/sm/H/Yd+g9U";
const token = "tok_visa_debit";

const server = app.app;
const twoWeeks = 1209600000;

chai.use(chaiHttp);

let users;

before(() => (users = app.getUsers())); // This depends on mochaInit.js to work

describe("-- Login --", () => {
	describe("- Successful login and logout -", () => {
		it("Should return 200", async () => {

			// Setup
			await users.insertOne({
					email,
					pwhash,
				});

			const agent = chai.request.agent(server);
			let res = await agent
				.post("/login")
				.send({ email, password });

			res.should.have.status(200);
			res.should.have.cookie('connect.sid')
			res = await agent.post("/get-user");
			res.should.have.status(200);
			// console.log(JSON.stringify(res, null, 4));
			res = await agent.post("/logout");
			res.should.have.status(200);
			res = await agent.post("/get-user");
			res.should.have.status(401);

			users.drop();
			agent.close();
		});
	});	
	describe("- Login with bad password -", () => {
		it("Should return 400", async () => {

			// Setup
			await users.insertOne({
				email,
				pwhash,
			});
			const agent = chai.request.agent(server);

			let res = await agent
				.post("/login")
				.send({ email, password: 'badpassword' });
			res.should.have.status(400);
			res.should.not.have.cookie('connect.sid')

			users.drop();
			agent.close();
		});
	});
	describe("- Login with bad username -", () => {
		it("Should return 400", async () => {

			// Setup
			await users.insertOne({
				email,
				pwhash,
			});
			const agent = chai.request.agent(server);

			let res = await agent
				.post("/login")
				.send({ email: 'bad@username.com', password });
			res.should.have.status(400);
			res.should.not.have.cookie('connect.sid')

			users.drop();
			agent.close();
		});
	});
	describe("- Login unconfirmed account -", () => {
		it("Should return error", async () => {

			// Setup
			await users.insertOne({
					email,
					confKeyHash: "confirmation_key",
					pwhash,
				});

			const agent = chai.request.agent(server);
			let res = await agent
				.post("/login")
				.send({ email, password });
			res.should.have.status(400);
			res.should.not.have.cookie('connect.sid')

			users.drop();
			agent.close();
		});
	});
});
