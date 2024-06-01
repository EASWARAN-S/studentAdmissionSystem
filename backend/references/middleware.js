/************************************
 * Handles the jwt token veification
 ************************************/

var reqUsrService = require('./servicehelper');
var reqDataLayer = require('./datalayer');
module.exports.isAvail = function (pReq, pRes, pNext) {
  if (!pReq.headers['x-access-token'] && pReq.headers['x-access-token'] == '') {
    reqDataLayer.SendResponse(false, pRes.status(400), "Authentication Failed.No Token Provided")
  }
  else {
    reqUsrService.VerifyToken(pReq, function (pErr, pResponse) {
      if (pErr) {
        reqDataLayer.SendResponse(false, pRes.status(400), "Authentication Failed.Please Provide Valid Token");
      }
      else {
        pNext();
      }
    })
  }
}