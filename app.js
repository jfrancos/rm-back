let express = require('express');
let app = express();
let port = process.env.PORT || 3000;
app.get('/', function (req, res) {
  res.send(`Example app listening on port ${port}!`);
});
app.listen(port, function () {
  console.log(`Example app listening on port ${port}!`);
});