/*******************************************************************************
 *  Handles the logging the errors, information and warning information on file 
 *******************************************************************************/

var reqFs = require("fs");
var reqMoment = require("moment");
var strFile = './log/LogFile' + reqMoment(new Date().getUTCSeconds()) + reqMoment(new Date().getMilliseconds()) + '.log';
/** To print the error on log file */
function PrintError(pError) {
    __WriteLogFile(pError, 'Error');
}

/** To print the information on log file */
function PrintInfo(pMsg) {
    __WriteLogFile(pMsg, 'Info')
}

/**  */
function __WriteLogFile(pMessage, pType) {
    __IsExceedSize();
    var strDateTime = '[' + reqMoment(new Date()).format('DD-MMM-YYYY hh:mm:ss a') + '] : ' + pType;
    var strText = '\r\n' + strDateTime + ' ' + JSON.stringify(pMessage);
    console.log(strText);
    reqFs.appendFile(strFile, strText, function (err) {
        if (err) return console.log(err);
    });
}

/** To check the size if exceeds above 1 MB, if exceeds the file size then create a new log file */
function __IsExceedSize() {
    reqFs.stat(strFile, function (err, stat) {
        if (err == null) {
            var fileSizeInBytes = stat["size"]
            //Convert the file size to megabytes (optional)
            var fileSizeInMegabytes = fileSizeInBytes / 1000000.0
            if (fileSizeInMegabytes > 1) {
                strFile = './log/LogFile' + reqMoment(new Date().getUTCSeconds()) + reqMoment(new Date().getMilliseconds()) + '.log';
            }
        }
    });
}

module.exports = {
    PrintError: PrintError,
    PrintInfo: PrintInfo
};