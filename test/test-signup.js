const chai = require("chai");
const chaiHttp = require("chai-http");
const server = require("../dist/app").app; // to make api calls
const callback = require('../dist/app').set_mocha_callback;
const close = require('../dist/app').close; // to close mongo and express server
const should = chai.should();
const nock = require("nock");
const qs = require("querystring").stringify;

const email = "justinfrancos@gmail.com";
const password = "ifthisislongenoughdictionarywordsarefine";
const token = "tok_visa_debit";

chai.use(chaiHttp);
const url = process.env.MONGODB_URI;

let users;

before ( done => {
  function getUsers(cb_users) {
    users = cb_users;
    done();
  }
  callback(getUsers);
})

after (() => {
  close(); // so mocha doesn't hang without --exit
})

tests = [
  [
    "- Weak password -",
    { password: "mypassword3", source: token, email: email }
  ],
  ["- Missing password -", { email: email, source: token }],
  ["- Missing token -", { password: password, email: email }],
  //['with bad token',                                { password: password, email: email, source: 'asdf'}], //touches stripe
  ["- Missing email -", { password: password, source: token }],
  ["- Bad email -", { password: password, source: token, email: "asdf" }],
  ["- Blank email -", { email: "", password: password, source: token }],
  ["- Blank token -", { email: email, password: password, source: "" }],
  ["- Blank password -", { email: email, password: "", source: token }]
  //['with card fails after successful attachment',   { email: email, password: password, source: 'tok_chargeCustomerFail' }] //touches stripe
];

//nock.recorder.rec();

const handleError = (res) => console.log(`MOCHA/CHAI: ${res.body.code}: ${res.body.message}`);

describe("--- TESTING SIGNUP ---", () => {
  describe("-- With parameters that don't meet joi validation --", () => {
    tests.forEach(test => {
      describe(test[0], function() {
        it("should return an error", done => {
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
          // Setup: none
          // Exercise
          chai
            .request(server)
            .post("/signup")
            .send(test[1])
            .end(function(err, res) {
              res.body.should.have.property('code', 'ValidationError');
              res.should.have.status(400);
              handleError(res);
              done();
            });
        }).timeout(4000);
      });
    });
  });

  describe("-- With existing email --", async () => {
    before(async () => {
      // Setup
      try {
        await users.insertOne({ email: "justinfrancos@gmail.com" });
      } catch (err) {
        console.error(err);
      }
    });
    it("should return 400", done => {
      // Exercise
      chai
        .request(server)
        .post("/signup")
        .send({ email: email, password: password, source: token })
        // Verify
        .end(function(err, res) {
          res.body.should.have.property('code', 'DuplicateUserError');
          res.should.have.status(400);
          handleError(res);
          done();
        });
    }).timeout(4000);
    // Teardown
    after(() => users.drop());
  });

  describe("with valid parameters", () => {
    it("should return 200 and no error", done => {
      chai
        .request(server)
        .post("/signup")
        .send({ email: email, password: password, source: token })
        .end(function(err, res) {
          res.body.should.not.include.key('code');
          res.should.have.status(200);
          done();
        });
    }).timeout(4000);
    after(() => users.drop());
  });
});
