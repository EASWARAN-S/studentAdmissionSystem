////************************************************************* */
//////////////////// API Version 2 STARTS HERE/////////////////////
////************************************************************* */

var reqDataBase = require("./database");
var reqMoment = require("moment");
var reqLogFile = require("./logfile");
var reqConfig = require("../config/config");

var mDBName = reqConfig.Database;

module.exports.login = function (pData, pCallback) {
  let sql = "CALL " + mDBName + ".showlogin(?,?)";
  let res = reqDataBase.query(sql, [pData.username, pData.password], pCallback);
};

//////////////////////////////////////RESET PASSWORD//////////////////////////////////////


module.exports.checkMailToResetPassword = function (pData, pCallback) {
  let qry = "CALL " + mDBName + ".`checkMailToResetPassword`(?, ?)";
  reqDataBase.query(qry, [pData.userCode, pData.mail], pCallback);
}

module.exports.storeOTPToResetPassword = function (pData, pCallback) {
  let qry = "CALL " + mDBName + ".`storeOTPToResetPassword`(?, ?)";
  reqDataBase.query(qry, [pData.userCode, pData.otp], pCallback);
}

module.exports.resetPassword = function (pData, pCallback) {
  let qry = "CALL " + mDBName + ".`resetPassword`(?, ?, ?)";
  reqDataBase.query(qry, [pData.userCode, pData.otp, pData.pwd], pCallback);
}

/**********************************************************/
/**********CUSTOM RESPONSE SENDER FUNCTION ****************/
/**********************************************************/
module.exports.SendResponse = function (success, res, result) {
  if (success) {
    res.send(JSON.stringify({ success: true, result }));
  } else {
    reqLogFile.PrintError(result);
    res.send({ success: false, result });
  }
};