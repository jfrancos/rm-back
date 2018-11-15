const chai = require('chai');
const chaiHttp = require('chai-http');
const server = require('../dist/app').app;
const should = chai.should();
const close = require('../dist/app').close; // to close mongo and express server

chai.use(chaiHttp);

after (close); // so mocha doesn't hang without --exit
const callback = require('../dist/app').set_mocha_callback;
before ( done => {
  function getUsers(cb_users) {
    users = cb_users;
    done();
  }
  callback(getUsers);
})

describe('invalid login', function() {
  beforeEach(async function () {
    // this.timeout(4000);
    try {
      await users.insertOne({ email: "justinfrancos@gmail.com", pwhash:'$argon2id$v=19$m=65536,t=4,p=1$TtlSXI0z7ifTQ7bntx7T4A$HrlFVadm42Mpv3CzRhnESp7YgoJlHeiWaCuRJ5gFVbU' });
    } catch (err) {
      console.error(err);
    }
  });
  it('should not return a token', function(done) {
    chai.request(server)
        .post('/login')
        .send({email: 'justinfrancos@gmail.com', password: 'fine'})
        .end(function(err, res) {
          res.body.should.not.include.keys('valid_until', 'mac');
          res.should.have.status(400);
      done();
    });
  });
});


describe('valid login', function() {
  beforeEach(async function () {
  this.timeout(4000);
  await chai.request(server)
       .post('/signup')
       .send({email: 'justinfrancos@gmail.com', password: 'ifthisislongenoughdictionarywordsarefine', source: 'tok_visa'});
});
  it('should return a token', function(done) {
    chai.request(server)
        .post('/login')
        .send({email: 'justinfrancos@gmail.com', password: 'ifthisislongenoughdictionarywordsarefine'})
  	    .end(function(err, res) {
  	  	  res.body.should.include.keys('valid_until', 'mac');
      	  res.should.have.status(200);
      done();
    });
  });
});