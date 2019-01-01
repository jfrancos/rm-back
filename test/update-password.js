const chai = require("chai");
const chaiHttp = require("chai-http");
const app = require("../dist/app");
const should = chai.should();
const nock = require("nock");
const sinon = require("sinon");
const qs = require("querystring").stringify;
const sodium = require("libsodium-wrappers-sumo");

const email = "justinfrancos@gmail.com";
const password = "ifthisislongenoughdictionarywordsarefine";
const pwhash = "$argon2id$v=19$m=65536,t=4,p=1$VUnpyWRaGSkJRO5So4WfLg$SWBQIezrpoyFN6MNCytfge8enId3FcY/sm/H/Yd+g9U";
const newPassword = "thisismynewpasswordihopeitslongenough"
const token = "tok_visa_debit";

const server = app.app;
const twoWeeks = 1209600000;

chai.use(chaiHttp);

let users;

before(() => (users = app.getUsers()));

describe("-- /update-password --", () => {
	describe("- Successful update with old password -", () => {
		it("Should return 200", async () => {
			let res;
			// Setup
			await users.insertOne({
					email,
					pwhash,
				});
			const agent = chai.request.agent(server);

			await agent
				.post("/login")
				.send({email, password});
			res = await agent
				.post("/update-password")
				.send({ oldPassword: newPassword, newPassword });
			res.should.have.status(400);
			res = await agent
				.post("/update-password")
				.send({ oldPassword: password, newPassword });
			res.should.have.status(200);
			res = await agent
				.post("/login")
				.send({ email, password });
			res.should.have.status(400);
			res = await agent
				.post("/login")
				.send({ email, password: newPassword });
			res.should.have.status(200);

			await users.drop();
			agent.close();
		});
	});	
	describe("- Successful update with accesstoken -", () => {
		it("Should return 200", async () => {
			let res;
			// Setup
			await users.insertOne({
					email,
					pwhash,
				});
			const agent = chai.request.agent(server);
			const spy = sinon.spy(sodium, "crypto_pwhash_str");
			await agent
				.post("/reset-password")
				.send({ email });
			const accessToken = spy.args[0][0];
			await agent
				.post("/login")
				.send({email, password});
			res = await agent
				.post("/update-password")
				.send({ oldPassword: newPassword, accessToken });
			res.should.have.status(400);
			res = await agent
				.post("/update-password")
				.send({ accessToken, newPassword, email });
			res.should.have.status(200);
			res = await agent
				.post("/login")
				.send({ email, password });
			res.should.have.status(400);
			res = await agent
				.post("/login")
				.send({ email, password: newPassword });
			res.should.have.status(200);
			sodium.crypto_pwhash_str.restore();
			await users.drop();
			agent.close();
		});
	});
	describe("Waiting too long to user the accesstoken", () => {
		it("Should fail", async () => {
			const clock = sinon.useFakeTimers((new Date()).getTime() - (60 * 60 * 1000) - 1000);
			// const clock = sinon.useFakeTimers();
			await users.insertOne({
					email,
					pwhash,
				});
			const agent = chai.request.agent(server);
			const spy = sinon.spy(sodium, "crypto_pwhash_str");
			await agent
				.post("/reset-password")
				.send({ email });
			const accessToken = spy.args[0][0];
			clock.restore();
			res = await agent
				.post("/update-password")
				.send({ accessToken, newPassword, email });
			res.should.have.status(400);
			sodium.crypto_pwhash_str.restore();
		})
	})
});
