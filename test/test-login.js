const chai = require('chai');
const chaiHttp = require('chai-http');
const server = require('../app');
const should = chai.should();

chai.use(chaiHttp);

describe('valid login', function() {
  beforeEach(async function () {
  await chai.request(server)
       .post('/signup')
       .send({username: 'justinfrancos@gmail.com', password: 'ifthisislongenoughdictionarywordsarefine'});
})
  it('should return a token', function(done) {

    chai.request(server)
        .post('/login')
        .send({username: 'justinfrancos@gmail.com', password: 'ifthisislongenoughdictionarywordsarefine'})
  	    .end(function(err, res) {
  	  	  res.body.should.include.keys('valid_until', 'mac');
      	  res.should.have.status(200);
      done();
    });
  });
});
