const chai = require("chai");
const chaiHttp = require("chai-http");
const server = require("../dist/app").app; // to make api calls
const close = require("../dist/app").close; // to close mongo and express server
const should = chai.should();
const nock = require("nock");
const qs = require("querystring").stringify;

const email = "justinfrancos@gmail.com";
const password = "ifthisislongenoughdictionarywordsarefine";
const token = "tok_visa_debit";

chai.use(chaiHttp);

const getUsers = require("../dist/app").getUsers;
let users;

before (() => users = getUsers()); // This depends on mochaInit.js to work
after(close); // so mocha doesn't hang without --exit

tests = [
  ["weak password", { password: "mypassword3", source: token, email: email }],
  ["missing password", { email: email, source: token }],
  ["missing token", { password: password, email: email }],
  ["missing email", { password: password, source: token }],
  ["bad email", { password: password, source: token, email: "asdf" }],
  ["blank email", { email: "", password: password, source: token }],
  ["blank token", { email: email, password: password, source: "" }],
  ["blank password", { email: email, password: "", source: token }]
  //['with card fails after successful attachment',   { email: email, password: password, source: 'tok_chargeCustomerFail' }] //touches stripe
];

//nock.recorder.rec();
// nock('https://api.stripe.com', { allowUnmocked: true, encodedQueryParams:false })
// .post('/v1/customers', qs({source:'asdf', email: email})).reply(400,{"error":{"code":"BAD_SOURCE_MOCK","type":"invalid_request_error"}})

// nock("https://api.stripe.com", { allowUnmocked: true })
//   .filteringPath(() => "")
//   .delete("")
//   .reply(400, {
//     error: {
//       code: "DELETION_ERROR_MOCK",
//       type: "invalid_request_error"
//     }
//   });

const handleError = res =>
  console.log(`MOCHA/CHAI: ${res.body.code}: ${res.body.message}`);

describe("--- TESTING SIGNUP ---", () => {
  tests.forEach(test => {
    describe(`-- With parameters that fail joi validation due to ${
      test[0]
    } --`, async () => {
      it("should return a ValidationError", async () => {
        // Exercise
        res = await chai
          .request(server)
          .post("/signup")
          .send(test[1]);

        // Verify
        res.body.should.have.property("code", "ValidationError");
        res.should.have.status(400);
        handleError(res);
      });
    });
  });

  describe("-- With invalid stripe token --", () => {
    it("should return a StripeInvalidRequestError", async () => {
      // Exercise
      res = await chai
        .request(server)
        .post("/signup")
        .send({ password: password, email: email, source: "asdf" });

      // Verify
      res.body.should.have.property("code", "StripeInvalidRequestError");
      res.should.have.status(400);
      handleError(res);
    }).timeout(10000);
  });

  describe("-- With existing email --", () => {
    it("should return 400 with code: DuplicateUserError", async () => {
      // Setup
      await users.insertOne({ email: "justinfrancos@gmail.com" });

      // Exercise
      const res = await chai
        .request(server)
        .post("/signup")
        .send({ email: email, password: password, source: token });

      // Verify
      handleError(res);
      res.body.should.have.property("code", "DuplicateUserError");
      res.should.have.status(400);

      // Teardown
      users.drop();
    }).timeout(10000);
  });

  describe("-- With valid parameters --", () => {
    it("should return 200 and no error", async () => {
      // Exercise
      const res = await chai
        .request(server)
        .post("/signup")
        .send({ email: email, password: password, source: token });

      //Verify
      res.body.should.not.include.key("code");
      res.body.should.include.keys("mac", "valid_until");
      res.should.have.status(200);

      // Teardown
      users.drop();
    }).timeout(10000);
  });
});
