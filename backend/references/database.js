var mysql = require('mysql');
var reqConfig = require("../config/config");

var connection = mysql.createPool({
    host: reqConfig.Server,
    port: reqConfig.Port,
    user: reqConfig.UserName,
    password: reqConfig.Password,
    database: reqConfig.Database
});
module.exports = connection