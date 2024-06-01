var request = require('request');
var moment = require('moment');
var jwt = require('jsonwebtoken');
var config = require('../config/config');
var user = require('./datalayer');
var reqLogFile = require("./logfile");
var reqQr = require("qrcode");
var reqEncryption = require("./encryption");
var reqFileHandler = require("./filehandler");
var reqAsync = require("async");
var reqMailer = require("./mailer");

module.exports.getUserCode = function (data, callback) {
    jwt.verify(data, config.secret, function (err, decoded) {
        if (err) {
            callback(true, err);
        } else {
            callback(false, decoded);
        }
    })
}

/********************************/
/*    Token Validation - start  */
/********************************/
module.exports.VerifyToken = function (req, callback) {
    var token = req.headers['x-access-token']
    jwt.verify(token, config.secret, function (err, decoded) {
        if (err) {
            callback(true, "Token InValid");
        } else {
            req.headers['userID'] = decoded.code;
            callback(false, "Token valid");
        }
    })
}

module.exports.VerifyAccess = function (data, callback) {
    var code = data.code;
    var perm = data.perm;
    user.getRoles(code, function (err, rows) {
        if (err) {
            callback(true, "DB ERROR");
        } else {
            if (rows.length > 0) {
                let bool = false;
                for (let all = 0; all < rows.length; all++) {
                    for (let p = 0; p < perm.length; p++) {
                        if (rows[all] === perm[p]) {
                            bool = true;
                            callback(false, "Access Grant");
                        }
                    }
                }
                if (!bool) {
                    callback(true, "Access Denied")
                }
            } else {
                callback(true, "Access Denied");
            }
        }
    })
}


/********************************/
/*    Token Validation - End  */
/********************************/

module.exports.SendMail = function (pOptions) {
    reqMailer.edpMailer.sendMail(pOptions, function (err, info) {
        if (err) {
            console.log(err);
        } else {
            console.log("Email send");
        }
    });
}

module.exports.SendFromContactMail = function (pOptions, pCallback) {
    reqMailer.contactMailer.sendMail(pOptions, function (err, info) {
        pCallback(err, info);
    });
}

module.exports.SendSMS = function (pOptions, pStudentId) {

    request.post('http://api.textlocal.in/send/', { form: pOptions }, function (err, res) {
        if (err) {
            reqLogFile.PrintError(err);
            pCallback(err, res);
        } else {
            let result = JSON.parse(res.body);
            user.smslog(pStudentId, pOptions.numbers, pOptions.message, pOptions.purpose, result.status, function (err, res) {
                if (err) {
                    reqLogFile.PrintError(err);

                } else {
                    reqLogFile.PrintInfo(res);
                }
            });
            reqLogFile.PrintInfo(result);
        }
    })
}

module.exports.GetArrangingSubject = function (req) {
    var batches = [];
    var tempdata = [];
    for (let d of req) {
        if (batches.indexOf(d.Batch_Year) === -1) {
            batches.push(d.Batch_Year);
        }
    }
    for (let all of batches) {
        var batchdata = [];
        for (let i = 0; i < req.length; i++) {
            if (all === req[i].Batch_Year) {
                batchdata.push({ 'SubCode': req[i].Sub_Code, 'section': req[i].Section, 'subject_name': req[i].Master_Sub_Name, 'handledBy': req[i].Staff_Prof_Name });
            }
        }
        tempdata.push({ 'batch': all, batchdata });
    }
    return tempdata;
}

module.exports.GetIATTimeTableInfo = function (req) {
    var batches = [];
    var tempdata = [];
    for (let d of req) {
        if (batches.indexOf(d.batch) === -1) {
            batches.push(d.batch);
        }
    }
    for (let all of batches) {
        var batchdata = [];
        for (let i = 0; i < req.length; i++) {
            if (all === req[i].batch) {
                batchdata.push({ 'subcode': req[i].subcode, 'subjectname': req[i].Master_Sub_Name, 'date': req[i].Exam_Date, 'starttime': req[i].Start_Time, 'endtime': req[i].End_Time });
            }
        }
        tempdata.push({ 'batch': all, batchdata });
    }
    return tempdata;
}

module.exports.PrepareSubjectDetailedInfo = function (pRows, pUserType) {
    let objSubData = {};
    if (pRows) {
        let arrSubDetail = pRows[0];
        for (let i = 0; i < arrSubDetail.length; i++) {
            objSubData = {
                "regulation": arrSubDetail[i]["master_regulation"], "subjectName": arrSubDetail[i]["Master_Sub_Name"],
                "subjectCode": arrSubDetail[i]["sub_code"], "subjectAcr": arrSubDetail[i]["Master_Sub_Acron"],
                "subCredit": arrSubDetail[i]["subCredit"], "subLectures": arrSubDetail[i]["subLectures"],
                "subTutorials": arrSubDetail[i]["subTutorials"],
                "subPracticals": arrSubDetail[i]["subPracticals"],
                "dept": arrSubDetail[i]["Dept_Name"], "batch": arrSubDetail[i]["Batch_Year"], "section": arrSubDetail[i]["section"],
                "semester": arrSubDetail[i]["semester"].toString().padStart(2, "0"), "subjectType": arrSubDetail[i]['master_sub_type'],
                "subjectIndex": arrSubDetail[i]['sub_index'],
                "staffCode": arrSubDetail[i]["staffCode"], "staffName": arrSubDetail[i]["staffName"],
                "staffDept": arrSubDetail[i]["staffDept"], "staffDesig": arrSubDetail[i]["staffDesig"],
                "staffTitle": arrSubDetail[i]["staffTitle"], "photoUrl": arrSubDetail[i]["photoUrl"],
                "studYear": this.convertRomanian(arrSubDetail[i]["studYear"]), "semStartDate": moment(arrSubDetail[i]["semStartDate"]).format("MMM Y"),
                "semEndDate": moment(arrSubDetail[i]["semEndDate"]).format("MMM Y"), "courseDegree": arrSubDetail[i]["courseDegree"],
                "academicYear": arrSubDetail[i]["academicYear"],
                "totalStudents": arrSubDetail[i]["totalStudents"]
            };
        }

        // to prepare the jsonobject for subject syllabus
        let strWebResources = __PrepareSyllabus(objSubData, pRows[1]);

        // to prepare the jsonobject for book detail
        __PrepareBook(objSubData, pRows[2], strWebResources);

        // to prepare the jsonobject for SelfLearningTopic/AssignmentTopics
        __PrepareTopics(objSubData, pRows[3])

        // to prepare the jsonobject for courseOutcomeMapping
        __PrepareOutcomeMapping(objSubData, pRows[4], pRows[1]);

        // to prepare the jsonobject for course planner
        __PrepareCoursePanner(objSubData, pRows[5]);

        // to prepare the jason object for PEO/PO info
        __CourseOutcomePOandPSOMap(objSubData, pRows[6], "PO");

        // to prepare the jason object for PSO info
        __CourseOutcomePOandPSOMap(objSubData, pRows[7], "PSO");

        // to prepare the record of class work 
        objSubData['courseROC'] = pRows[8];

        // to prepare the coursereview
        __CourseReview(objSubData, pRows[9]);

        // To prepare Material notes uploaded
        __MaterialNotes(objSubData, pRows[10], pUserType);

        // To prepare class timetable for staff
        __ClassTimetable(objSubData, pRows[12], pUserType)

        // To Prepare Dept mission, vision, dept PEO map with  */
        __DeptPSOPEO(objSubData, pRows[13], pRows[14], pRows[15]);


  }
    return objSubData;
    

    function __PrepareSyllabus(pSubjectData, pRows) {
        // to prepare the jsonobject for subject syllabus
        let lstSyllabus = [];
        let arrSyllabus = pRows;
        let strWebResources;
        for (let i = 0; i < arrSyllabus.length; i++) {
            pSubjectData["courseOverviewAndContext"] = arrSyllabus[i]["course_overview_context"]
            pSubjectData["prerequisites"] = arrSyllabus[i]["prerequisites"]
            pSubjectData["courseObjective"] = arrSyllabus[i]["course_objective"];
            strWebResources = arrSyllabus[i]["web_resources"];
            lstSyllabus.push({ "id": arrSyllabus[i]["id"], "unitNo": arrSyllabus[i]["Unit_No"], "Header": arrSyllabus[i]["Header"], "Content": arrSyllabus[i]["Content"], "Duration": arrSyllabus[i]["Duration"] })
        }
        pSubjectData["subjectSyllabus"] = lstSyllabus;

        return strWebResources;
    }

    function __PrepareBook(pSubjectData, pRows, pWebResources) {
        // to prepare the jsonobject for book detail
        let lstBook = [];
        let arrBook = pRows;
        let arrTextBook = [];
        let arrRefBook = [];
        for (let i = 0; i < arrBook.length; i++) {
            if (arrBook[i]["reference_type"] == "T")
                arrTextBook.push({ "referenceId": arrBook[i]["id"], "id": arrBook[i]["book_id"], "referenceType": arrBook[i]["reference_type"], "Author": arrBook[i]["author_name"], "Name": arrBook[i]["book_name"], "Publisher": arrBook[i]["publisher"], "Edition": arrBook[i]["edition"], "YearOfPublished": arrBook[i]["published_year"] })
            if (arrBook[i]["reference_type"] == "R")
                arrRefBook.push({ "referenceId": arrBook[i]["id"], "id": arrBook[i]["book_id"], "referenceType": arrBook[i]["reference_type"], "Author": arrBook[i]["author_name"], "Name": arrBook[i]["book_name"], "Publisher": arrBook[i]["publisher"], "Edition": arrBook[i]["edition"], "YearOfPublished": arrBook[i]["published_year"] })
        }
        pSubjectData["subjectResources"] = { "textBook": arrTextBook, "referenceBook": arrRefBook, "webResources": ((pWebResources != null && pWebResources != "") ? pWebResources.split(";") : []) };
    }

    function __PrepareTopics(pSubjectData, pRows) {
        // to prepare the jsonobject for SelfLearningTopic/AssignmentTopics
        let arrTopic = pRows;
        // prepare self learning topic
        var selfTopic = arrTopic.filter(function (topic) {
            return topic['topic_type'].toUpperCase() == 'ST';
        });
        // Prepare Assignment topic
        var assignTopic = arrTopic.filter(function (topic) {
            return topic['topic_type'].toUpperCase() == 'AT';
        });

        pSubjectData["selfLearningTopics"] = exports.GetPrepareTopic(selfTopic);
        pSubjectData["assignmentTopics"] = exports.GetPrepareTopic(assignTopic);
    }

    function __PrepareOutcomeMapping(pSubjectData, pRows, pSyllabus) {
        // to prepare the jsonobject for courseOutcomeMapping
        let lstCourseOutcome = [];
        let arrCourseOutcome = pRows;
        for (let i = 0; i < arrCourseOutcome.length; i++) {
            lstCourseOutcome.push({ "id": arrCourseOutcome[i]["id"], "outcomeNo": (arrCourseOutcome[i]["outcome_no"]) ? arrCourseOutcome[i]["outcome_no"] : "", "outcomes": (arrCourseOutcome[i]["outcomes"]) ? arrCourseOutcome[i]["outcomes"] : "", "attainmentLevel": (arrCourseOutcome[i]["attainment_level"]) ? arrCourseOutcome[i]["attainment_level"] : "" })
        }
        pSubjectData["courseOutcome"] = lstCourseOutcome;
    }

    function __PrepareCoursePanner(pSubjectData, pRows) {
        // to prepare the jsonobject for coursePlanner
        let lstCoursePlan = [];
        let arrCoursePlan = pRows;
        for (let i = 0; i < arrCoursePlan.length; i++) {
            lstCoursePlan.push({ "id": arrCoursePlan[i]["id"], "unit": arrCoursePlan[i]["unit"], "topic": arrCoursePlan[i]["topic"], "subjectId": arrCoursePlan[i]["sub_id"], "reference": arrCoursePlan[i]["reference"], "pageNo": arrCoursePlan[i]["pageno"], "noOfHours": arrCoursePlan[i]["no_hours"], "weekNo": arrCoursePlan[i]["weekno"], "teachingMethod": arrCoursePlan[i]["teaching_method"], "testingMethod": arrCoursePlan[i]["testing_method"], "courseOutcome": arrCoursePlan[i]["course_outcome"], "teachingAid": arrCoursePlan[i]["teaching_aid"], "assesmentMethod": arrCoursePlan[i]['assesment_method'] })
        }
        
        pSubjectData["coursePlanner"] = lstCoursePlan;
    }

    function __CourseOutcomePOandPSOMap(pSubjectData, pRows, pType) {
        // to prepare the jsonobject for courseoutcome PO and PSO map
        let lstPOandPSOData = [];
        let arrPOData = pRows;
        for (var k = 0; k < arrPOData.length; k++) {
            var lstPOData = [];
            var objPOData = {
                "id": (arrPOData[k]) ? arrPOData[k]["assesmentId"] : "",
                "Content": (arrPOData[k]) ? arrPOData[k]["Content"] : "",
                "Header": (arrPOData[k]) ? arrPOData[k]["Header"] : ""
            }
            for (let i = 0; i < pSubjectData["courseOutcome"].length; i++) {
                lstPOData.push({
                    "id": (arrPOData[k]["co" + (i + 1)]) ? arrPOData[k]["mapId"] : "",
                    "value": (arrPOData[k]["co" + (i + 1)]) ? arrPOData[k]["co" + (i + 1)] : ""
                })
            }
            objPOData["Co"] = lstPOData;
            lstPOandPSOData.push(objPOData);
        }
        if (pType == "PO")
            pSubjectData["courseOutcomePoMap"] = lstPOandPSOData;
        else
            pSubjectData["courseOutcomePsoMap"] = lstPOandPSOData;
    }

    // To prepare CourseReview json object
    function __CourseReview(pSubjectData, pRows) {
        var lstCourseReview = [];
        for (var k = 0; k < pRows.length; k++) {
            lstCourseReview.push({
                "id": pRows[k]['id'],
                "reviewedBy": {
                    "staffCode": pRows[k]['staffCode'],
                    "staffName": pRows[k]['staffName'],
                    "dept": pRows[k]['dept'],
                    "photoUrl": pRows[k]['photoUrl'],
                    "designation": pRows[k]['designation']
                },
                "reviewComment": pRows[k]['reviewComment'],
                "reviewedOn": pRows[k]['reviewedOn']
            });
        }
        pSubjectData['courseReview'] = lstCourseReview;
    }

    function __MaterialNotes(pSubjectData, pRows, pUserType) {
        /** doc_type 
         * 1 -> private documents   
         * 2 -> public documents  
        ***/
        let strSharedFileServer = reqFileHandler.GetFileServer();
        if (pUserType == "STAFF") {
            let lstMaterial = [];

            let arrUniqueUnit = pRows.map(function (obj) { return { "unitNo": obj.unitNo, "docHeader": obj.docHeader } });
            arrUniqueUnit = arrUniqueUnit.filter((value, index, self) => self.map(x => x.unitNo).indexOf(value.unitNo) == index)
                .sort(function (a, b) {
                    return a.unitNo - b.unitNo
                });

            for (let unitIdx = 0; unitIdx < arrUniqueUnit.length; unitIdx++) {

                let arrUnit = pRows.filter(obj => { return obj.unitNo == arrUniqueUnit[unitIdx]["unitNo"] && obj.docId != null })
                    .map(itm => {
                        return {
                            "docId": itm.docId,
                            "docTitle": itm.docTitle,
                            "docName": itm.docName,
                            "docDesc": itm.docDesc,
                            "docSize": itm.docSize,
                            "docUrl": itm.docUrl,
                            "docType": itm.docType,
                            "docExt": (reqFileHandler.GetFileExtension(itm.docUrl)).substring(1),
                            "uploadedOn": moment(itm.uploadedOn).format("YYYY-MM-DD hh:mm:ss A"),
                            "uploadedByStaffCode": itm.uploadedStaffCode,
                            "uploadedByStaffName": itm.uploadedStaffName,
                            "isActive": itm.isActive,
                            "viewCount": itm.viewCount,
                            "downloadCount": itm.downloadCount,
                            "avgRating": itm.avgRating,
                            "totalStuRated": itm.totalStuRated,
                            "docThumbnail": itm.docThumbnail,
                            "docThumbnailImage": "data:image/" + (reqFileHandler.GetFileExtension(itm.docThumbnail)).substring(1) + ";base64," + (reqFileHandler.ReadImageAsBase64(reqPath.join(reqFileHandler.GetFileServer(), (itm.docThumbnail ? itm.docThumbnail : ""))))
                        }
                    });

                // To Sort by Date 
                arrUnit.sort(function (a, b) {
                    return new Date(b.uploadedOn) - new Date(a.uploadedOn)
                })

                lstMaterial.push({
                    "docUnit": ((arrUniqueUnit[unitIdx]["unitNo"] == "0") ? "COMMON" : ("UNIT " + arrUniqueUnit[unitIdx]["unitNo"])),
                    "docHeader": (arrUniqueUnit[unitIdx]["unitNo"] == "0") ? "" : arrUniqueUnit[unitIdx]["docHeader"],
                    "materialNotes": arrUnit
                })
            }
            pSubjectData["materialNotes"] = lstMaterial;
        } else {
            let lstMaterial = [];
            let arrUniqueUnit = pRows.map(function (obj) { return { "unitNo": obj.unitNo, "docHeader": obj.docHeader } });
            arrUniqueUnit = arrUniqueUnit.filter((value, index, self) => self.map(x => x.unitNo).indexOf(value.unitNo) == index)
                .sort(function (a, b) {
                    return a.unitNo - b.unitNo
                });

            for (let unitIdx = 0; unitIdx < arrUniqueUnit.length; unitIdx++) {

                let arrMaterial = pRows.filter((itm) => { return itm.unitNo == arrUniqueUnit[unitIdx]["unitNo"] && itm.docId != null })
                    .map((obj) => {
                        return {
                            "docId": obj.docId,
                            "docHeader": obj.docHeader,
                            "unitNo": obj.unitNo,
                            "docTitle": obj.docTitle,
                            "uploadedOn": moment(obj.uploadedOn).format("YYYY-MM-DD hh:mm:ss A"),
                            "docName": obj.docName,
                            "docDesc": obj.docDesc,
                            "docUrl": obj.docUrl,
                            "docSize": obj.docSize,
                            "docType": obj.docType,
                            "docExt": (reqFileHandler.GetFileExtension(obj.docUrl)).substring(1),
                            "uploadedByStaffCode": obj.staffCode,
                            "staffTitle": obj.staffTitle,
                            "uploadedByStaffName": obj.staffName,
                            "staffDept": obj.staffDept,
                            "staffDesig": obj.staffDesig,
                            "photoUrl": obj.photoUrl,
                            "viewCount": obj.viewCount,
                            "downloadCount": obj.downloadCount,
                            "avgRating": obj.avgRating,
                            "totalStuRated": obj.totalStuRated,
                            "selfRating": obj.selfRating,
                            "selectedStaff": (obj.selectedStaff != null && obj.selectedStaff != '') ? "1" : "0",
                            "docThumbnail": obj.docThumbnail,
                            "docThumbnailImage": "data:image/" + (reqFileHandler.GetFileExtension(obj.docThumbnail)).substring(1) + ";base64," + (reqFileHandler.ReadImageAsBase64(reqPath.join(reqFileHandler.GetFileServer(), (obj.docThumbnail) ? obj.docThumbnail : "")))
                        }
                    });
                // To Sort by Date 
                arrMaterial.sort(function (a, b) {
                    return new Date(b.uploadedOn) - new Date(a.uploadedOn)
                })
                lstMaterial.push({
                    "docUnit": ((arrUniqueUnit[unitIdx]["unitNo"] == "0") ? "COMMON" : ("UNIT " + arrUniqueUnit[unitIdx]["unitNo"])),
                    "docHeader": (arrUniqueUnit[unitIdx]["unitNo"] == "0") ? "" : arrUniqueUnit[unitIdx]["docHeader"],
                    "materialNotes": arrMaterial
                })
            }
            pSubjectData["materialNotes"] = lstMaterial;
        }
    }

    function __ClassTimetable(pSubjectData, pRows, pUserType) {
        let days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
        let lstWeek = [];
        if (pUserType.toString().toUpperCase() == "STAFF") {

            for (let idx = 0; idx < days.length; idx++) {
                let lstHours = [];
                for (let hrIdx = 0; hrIdx < 7; hrIdx++) { // hours looping

                    let arrSubjects = pRows.filter(obj => { return obj["day"].toString().toUpperCase() == days[idx].toString().toUpperCase() && obj["hour"] == hrIdx + 1 })
                    if (arrSubjects.length > 0)
                        lstHours.push(arrSubjects[0]["subCode"])
                    else
                        lstHours.push("");
                }
                lstWeek.push({
                    "day": days[idx],
                    "subList": lstHours
                })
            }
        }
        pSubjectData["classTimeTable"] = lstWeek;
    }

    function __DeptPSOPEO(pSubjectData, pRowsDept, pRowsPeoMap, pRowsPsoMao) {


        pSubjectData["deptMission"] = pRowsDept.length > 0 ? pRowsDept[0]['Dept_Mission'] : ""
        pSubjectData["deptVision"] = pRowsDept.length > 0 ? pRowsDept[0]['Dept_Vision'] : ""
        pSubjectData["deptPeo"] = pRowsDept.filter(obj => { return obj["assesment_id"] && obj['Type'] == 'PEO' })
            .map(itm => {
                return { "id": itm['assesment_id'], "title": itm['Header'], "content": itm['Content'] }
            })

        pSubjectData["deptPso"] = pRowsDept.filter(obj => { return obj["assesment_id"] && obj['Type'] == 'PSO' })
            .map(itm => {
                return { "id": itm['assesment_id'], "title": itm['Header'], "content": itm['Content'] }
            })


        let peoMap = [];
        let psoMap = [];
        for (let all of pRowsPeoMap) {
            if (all['Type'] == 'PO') {
                let dt = [];
                for (let i = 0; i < pSubjectData["deptPeo"].length; i++) {
                    dt.push({ "id": all['mapId'], "value": all['Peo' + (i + 1)] });
                }
                peoMap.push({ "Content": all['Content'], "Header": all['Header'], "id": all['assesmentId'], "Peo": dt })
            }
        }
        for (let all of pRowsPsoMao) {
            if (all['Type'] == 'PSO') {
                let dt = [];
                for (let i = 0; i < pSubjectData["deptPeo"].length; i++) {
                    dt.push({ "id": all['mapId'], "value": all['Peo' + (i + 1)] });
                }
                psoMap.push({ "Content": all['Content'], "Header": all['Header'], "id": all['assesmentId'], "Peo": dt })
            }
        }
        pSubjectData["deptPeoMap"] = peoMap;
        pSubjectData["deptPsoMap"] = psoMap;
    }
}

module.exports.StudentAttendanceSheet = (pRows) => {
    let objData = {}
    if (pRows.length > 0) {
        objData["attendanceDate"] = moment(pRows[0]["semStartDate"]).format("YYYY-MM-DD") + " - " + moment(pRows[0]["semEndDate"]).format("YYYY-MM-DD")

        let lstUniqueStudents = pRows.map(function (obj) { return { "RegisterNo": obj.registerNo, "StudentName": obj.studentName, "section": obj.section }; });
        lstUniqueStudents = lstUniqueStudents.filter((value, index, self) => self.map(x => x.RegisterNo).indexOf(value.RegisterNo) == index).sort();


        for (let stuIdx = 0; stuIdx < lstUniqueStudents.length; stuIdx++) {
            let lstStudent = pRows.filter(obj => { return obj["registerNo"] == lstUniqueStudents[stuIdx]["RegisterNo"] })

            lstStudent.sort(function (a, b) {
                return new Date(a.attendDate) - new Date(b.attendDate)
            })

            let objAttendanceSheet = {}
            // To get unique unique date
            lstStudent.map(function (itm) {
                var date = moment(itm["attendDate"]).format("YYYY-MM-DD");
                let strDay = moment(itm["attendDate"]).format("DD");
                let strMonth = moment(itm["attendDate"]).format("MM");;
                let strKey = strDay + "/" + strMonth + " (" + itm.attendHour + ")";
                objAttendanceSheet[strKey] = itm.attendStatus
            });

            lstUniqueStudents[stuIdx]["attendance"] = objAttendanceSheet
        }
        objData["studentList"] = lstUniqueStudents;
    }
    return objData;
}


module.exports.getAbsentlist = function (data) {
    var absentList = [];
    if (data.periods[1] === true) {
        for (let att of data.entrydetails) {
            if (att.status === "A") {
                absentList.push(att.regno);
            }
        }
    }
    return absentList;
}

module.exports.putdailytt = function (data, callback) {
    user.putdailytt(data, function (err, rows) {
        if (err) {
            callback(true, err);
        } else {
            callback(false, rows);
        }
    })
}

module.exports.chkpermission = function (perm, staff_code, callback) {
    chkperm.permissioncheck(perm, staff_code, function (err, req) {
        let status = false;
        if (err) throw err;
        else {
            let loadperm = [];
            if (req[0].length > 0) {
                for (let i = 0; i < req[0].length; i++) {
                    if (loadperm.indexOf(req[0][i].Staff_Type) === -1) {
                        loadperm.push(req[0][i].Staff_Type);
                    }
                    if (loadperm.indexOf(req[0][i].Role_Code) === -1) {
                        loadperm.push(req[0][i].Role_Code);
                    }
                }
            }
            for (let i = 0; i < perm.length; i++) {
                for (let j = 0; j < loadperm.length; j++) {
                    if (perm[i] === loadperm[j]) {
                        status = true;
                    }
                }
            }
            if (status) {
                callback(false, 'Approved');
            } else {
                callback(false, 'Denied');
            }
        }
    })
}

module.exports.SendStudentBDayWish = function (pCallback) {
    var message = 'Dear Student, Wish you many more happy returns of the day. Dr. S. Cletus Babu, Chairman & Er. C. Arun Babu, Managing Director - FXEC.';
    var purpose = 'Birthday Wishes';
    user.getTodayDob(function (err, req) {
        if (err) throw err;
        for (let i = 0; i < 1; i++) { //req.length
            if (req[i].STUDENT_DOB && req[i].STUDENT_MOBILE_NO != '') {
                reqLogFile.PrintInfo(req[i].STUDENT_DOB, req[i].STUDENT_MOBILE_NO);
                var opts =
                {
                    sender: 'FXENGG',
                    username: 'edp@francisxavier.ac.in',
                    hash: '686586a8d24b961addece14b7c8c9fcbca0a151bd1ef8390a3c1b69d44edc587',
                    numbers: '7200515447',//JSON.stringify(req[i].STUDENT_MOBILE_NO),
                    message: message,
                    json: 1
                };
                request.post('http://api.textlocal.in/send/', { form: opts }, function (err, res) {
                    if (err) {
                        reqLogFile.PrintError(err);
                        pCallback(err, res);
                    } else {
                        let result = JSON.parse(res.body);
                        user.smslog(req[i].REGISTER_NO, req[i].STUDENT_MOBILE_NO, message, purpose, result.status, function (err, res) {
                            if (err) {
                                reqLogFile.PrintError(err);
                                pCallback(err, 'Failed sending sms');
                            } else {
                                reqLogFile.PrintInfo(res);
                                pCallback(err, res);
                            }
                        });
                        reqLogFile.PrintInfo(result);
                    }
                })
            } else {
                reqLogFile.PrintInfo("not satisfied");
                pCallback("Not Satisfied", null);
            }
        }
    });
}

/** to prepare a IAT Mark with InternalMark calculation */
module.exports.GetPrepareIATMark = (pMarks) => {
    /**
      *  For Regulation 2019
      *  (IAT1 + IAT2)/200 * (2 * 15)  , for one Test => (IAT1)/100 * 15  
      *  (FA1 + FA2)/50 * (2 * 5)     , for one Test => (FA1)/25 * 5  
      
      *  For Regulation 2013, 2017
      *  (IAT1 + IAT2)/200 * (20/3) * 2  , for one Test => (IAT1)/100 * (20/3) * 1  
    */
    let strRegulation;
    let lstMark = [];
    if (pMarks.length > 0) {
        strRegulation = pMarks[0]['regulation'];
    }
    var arrSubject = pMarks.map(function (obj) { return obj.subject; });
    arrSubject = arrSubject.filter(function (v, i) { return arrSubject.indexOf(v) == i; });
    for (let subIndx = 0; subIndx < arrSubject.length; subIndx++) {
        if (strRegulation.toUpperCase() == 'R2019' || strRegulation.toUpperCase() == 'R2020') {
            // calculate IAT exam and convert (MaxMark-100) it to 15 marks 
            let arrIATExam = pMarks.filter(function (objMark) {
                return objMark['regulation'] == strRegulation && objMark['subject'] == arrSubject[subIndx] && objMark['testAcr'].indexOf('IAT') !== -1;
            });
            let sumIAT = 0
            for (let i = 0; i < arrIATExam.length; i++) {
                sumIAT = sumIAT + ((arrIATExam[i]['totalMark'] == undefined) ? 0 : arrIATExam[i]['totalMark'])
            }
            // let sumIAT = arrIATExam.reduce((a, b) => {
            //     return ((a['totalMark'] == undefined) ? 0 : a['totalMark']) + ((b['totalMark'] == undefined) ? 0 : b['totalMark']);
            // }); // IAT1+IAT2 => 80+70
            let IAT = sumIAT / (arrIATExam.length * 100); // (80+70)/200
            let strIATCGPAPoint = parseFloat((IAT * (arrIATExam.length * 15))).toFixed(2); // (80+70)/200  * (2*15)  (Two IAT exam)
            // calculate FA exam and convert (MaxMark-25) it to 5 marks 
            let arrFAExam = pMarks.filter(function (objMark) {
                return objMark['regulation'] == strRegulation && objMark['subject'] == arrSubject[subIndx] && objMark['testAcr'].indexOf('FA') !== -1;
            });
            let sumFA = 0
            for (let i = 0; i < arrFAExam.length; i++) {
                sumFA = sumFA + ((arrFAExam[i]['totalMark'] == undefined) ? 0 : arrFAExam[i]['totalMark'])
            } // FA1 + FA2 => 24+20
            // let sumFA = arrFAExam.reduce((a, b) => {
            //     return ((a['totalMark'] == undefined) ? 0 : a['totalMark']) + ((b['totalMark'] == undefined) ? 0 : b['totalMark'])
            // }); // FA1 + FA2 => 24+20
            let FA = sumFA / (arrFAExam.length * 25); // (80+70)/25
            let strFACGPAPoint = parseFloat((FA * (arrFAExam.length * 5))).toFixed(2); // (24+20)/50  * (2*5)  (Two FA exam)
            // Total mark achieved 
            strIATCGPAPoint = (Number.isNaN(strIATCGPAPoint) || strIATCGPAPoint == "NaN") ? 0 : strIATCGPAPoint;
            strFACGPAPoint = (Number.isNaN(strFACGPAPoint) || strFACGPAPoint == "NaN") ? 0 : strFACGPAPoint;
            let strtotal = strIATCGPAPoint + strFACGPAPoint;
            __PrepareJson(lstMark, arrSubject[subIndx], arrIATExam, arrFAExam, strtotal)
        } else {
            // calculate IAT exam and convert (MaxMark-100) it to 20 marks 
            let arrIATExam = pMarks.filter(function (objMark) {
                return objMark['regulation'] == strRegulation && objMark['subject'] == arrSubject[subIndx];
            });
            let sumIAT = 0
            for (let i = 0; i < arrIATExam.length; i++) {
                sumIAT = sumIAT + ((arrIATExam[i]['totalMark'] == undefined) ? 0 : arrIATExam[i]['totalMark'])
            }
            // let sumIAT = arrIATExam.reduce((a, b) => {
            //     return ((a['totalMark'] == undefined) ? 0 : a['totalMark']) + ((b['totalMark'] == undefined) ? 0 : b['totalMark']);
            // }); // IAT1+IAT2 => 80+70
            let IAT = sumIAT / (arrIATExam.length * 100);  // (80+70)/200
            let strIATCGPAPoint = parseFloat((IAT * ((20 / 3) * arrIATExam.length))).toFixed(2);  // (80+70)/200  * (20/3)*2  (Two IAT exam)
            strIATCGPAPoint = (Number.isNaN(strIATCGPAPoint)) ? 0 : strIATCGPAPoint;
            __PrepareJson(lstMark, arrSubject[subIndx], arrIATExam, [], strIATCGPAPoint)
        }
    }
    return lstMark;
}

// module.exports.GetPrepareIATMark = (pMarks) => {
//     /**
//       *  For Regulation 2019
//       *  (IAT1 + IAT2)/200 * (2 * 15)  , for one Test => (IAT1)/100 * 15  
//       *  (FA1 + FA2)/50 * (2 * 5)     , for one Test => (FA1)/25 * 5  
//       *  For Regulation 2013, 2017
//       *  (IAT1 + IAT2)/200 * (20/3) * 2  , for one Test => (IAT1)/100 * (20/3) * 1  
//     */
//     let strRegulation;
//     let lstMark = [];
//     if (pMarks.length > 0) {
//         strRegulation = pMarks[0]['regulation'];
//     }
//     var arrSubject = pMarks.map(function (obj) { return obj.subject; });
//     arrSubject = arrSubject.filter(function (v, i) { return arrSubject.indexOf(v) == i; });
//     for (let subIndx = 0; subIndx < arrSubject.length; subIndx++) {
//         if (strRegulation.toUpperCase() == 'R2019') {
//             // calculate IAT exam and convert (MaxMark-100) it to 15 marks 
//             let arrIATExam = pMarks.filter(function (objMark) {
//                 return objMark['regulation'] == strRegulation && objMark['subject'] == arrSubject[subIndx] && objMark['testAcr'].indexOf('IAT') !== -1;
//             });
//             let sumIAT = 0
//             for (let i = 0; i < arrIATExam.length; i++) {
//                 sumIAT = sumIAT + ((arrIATExam[i]['totalMark'] == undefined) ? 0 : arrIATExam[i]['totalMark'])
//             }
//             // let sumIAT = arrIATExam.reduce((a, b) => {
//             //     return ((a['totalMark'] == undefined) ? 0 : a['totalMark']) + ((b['totalMark'] == undefined) ? 0 : b['totalMark']);
//             // }); // IAT1+IAT2 => 80+70
//             let IAT = sumIAT / (arrIATExam.length * 100);  // (80+70)/200
//             let strIATCGPAPoint = parseFloat((IAT * (arrIATExam.length * 15))).toFixed(2);  // (80+70)/200  * (2*15)  (Two IAT exam)
//             // calculate FA exam and convert (MaxMark-25) it to 5 marks 
//             let arrFAExam = pMarks.filter(function (objMark) {
//                 return objMark['regulation'] == strRegulation && objMark['subject'] == arrSubject[subIndx] && objMark['testAcr'].indexOf('FA') !== -1;
//             });
//             let sumFA = arrFAExam.
//             reduce((a, b) => {
//                 return ((a['totalMark'] == undefined) ? 0 : a['totalMark']) + ((b['totalMark'] == undefined) ? 0 : b['totalMark'])
//             }); // FA1 + FA2 => 24+20
//             let FA = sumFA / (arrFAExam.length * 25);  // (80+70)/25
//             let strFACGPAPoint = parseFloat((FA * (arrFAExam.length * 5))).toFixed(2);  // (24+20)/50  * (2*5)  (Two FA exam)
//             // Total mark achieved 
//             strIATCGPAPoint = (Number.isNaN(strIATCGPAPoint) || strIATCGPAPoint == "NaN") ? 0 : strIATCGPAPoint;
//             strFACGPAPoint = (Number.isNaN(strFACGPAPoint) || strFACGPAPoint == "NaN") ? 0 : strFACGPAPoint;
//             let strtotal = strIATCGPAPoint + strFACGPAPoint;
//             __PrepareJson(lstMark, arrSubject[subIndx], arrIATExam, arrFAExam, strtotal)
//         } else {
//             // calculate IAT exam and convert (MaxMark-100) it to 20 marks 
//             let arrIATExam = pMarks.filter(function (objMark) {
//                 return objMark['regulation'] == strRegulation && objMark['subject'] == arrSubject[subIndx];
//             });
//             let sumIAT = 0
//             for (let i = 0; i < arrIATExam.length; i++) {
//                 sumIAT = sumIAT + ((arrIATExam[i]['totalMark'] == undefined) ? 0 : arrIATExam[i]['totalMark'])
//             }
//             // let sumIAT = arrIATExam.reduce((a, b) => {
//             //     return ((a['totalMark'] == undefined) ? 0 : a['totalMark']) + ((b['totalMark'] == undefined) ? 0 : b['totalMark']);
//             // }); // IAT1+IAT2 => 80+70
//             console.log(sumIAT);
//             let IAT = sumIAT / (arrIATExam.length * 100);  // (80+70)/200
//             let strIATCGPAPoint = parseFloat((IAT * ((20 / 3) * arrIATExam.length))).toFixed(2);  // (80+70)/200  * (20/3)*2  (Two IAT exam)
//             strIATCGPAPoint = (Number.isNaN(strIATCGPAPoint)) ? 0 : strIATCGPAPoint;
//             __PrepareJson(lstMark, arrSubject[subIndx], arrIATExam, [], strIATCGPAPoint)
//         }
//     }
//     return lstMark;
// }

function __PrepareJson(pMarks, pSubject, pIATLst, pFALst, strtotal) {
    let objMark = {
        "Exam": pSubject
    }
    let subName;
    for (let i = 0; i < pIATLst.length; i++) {
        objMark[pIATLst[i]['testAcr']] = pIATLst[i]['totalMark'];
        subName = pIATLst[i]['subjectName'];
    }
    for (let j = 0; j < pFALst.length; j++) {
        objMark[pFALst[j]['testAcr']] = pFALst[j]['totalMark'];
        subName = pFALst[j]['subjectName'];
    }
    objMark['SubjectName'] = subName;
    objMark['Internal Mark'] = strtotal;
    pMarks.push(objMark);
}

module.exports.sendSmsAbsenties = function (data, callback) {
    reqLogFile.PrintInfo(data);
    for (let all of data) {
        if (all.name && all.father_mobile && all.father_mobile != '') {
            var opts =
            {
                sender: 'FXENGG',
                username: 'edp@francisxavier.ac.in',
                hash: '686586a8d24b961addece14b7c8c9fcbca0a151bd1ef8390a3c1b69d44edc587',
                numbers: JSON.stringify(all.father_mobile),
                message: 'Your Ward ' + all.name + ' 1st hour Absent on Date : 18-10-2018. Thank You. Principal-FXEC',
                json: 1
            };
            request.post('https://api.textlocal.in/send/', { form: opts }, function (err, res) {
                if (err) {
                    reqLogFile.PrintError(err);
                }
                else {
                    let result = JSON.parse(res.body);
                    reqLogFile.PrintInfo(result.status);
                }
            })
        }
    }
    callback();
}


module.exports.SendIATMark = function (data, callback) {
    let lstRegNo = data[1].map(item => item.stuRegno)
        .filter((value, index, self) => self.indexOf(value) === index)
    var strDept = data[0][0]['deptName']
    var strHOD = data[0][0]['staffName']
    var strHODMobile = data[0][0]['staffMobile']
    var strSemester = '2019-20-ODD'
    reqAsync.forEachSeries(lstRegNo, function (regno, asyncCallback) {
        let arrStu = data[1].filter(function (stu) {
            return stu['stuRegno'] == regno;
        })
        let stuMobile = arrStu[0]['stuMobile']; // '8870056146'
        if (stuMobile != '') {
            console.log(JSON.stringify(arrStu));
            let strExam = arrStu[0]['exam'], strStudName = arrStu[0]['stuName'], strStudMark = '';
            let strMentor = arrStu[0]['stuMentor'];
            let strMentorMobile = arrStu[0]['mentMobile'];
            for (let subIndx = 0; subIndx < arrStu.length; subIndx++) {
                if (subIndx != 0)
                    strStudMark = strStudMark + ',';

                let strMarkStatus = 'PASS';
                if (arrStu[subIndx]['amark'] < 50)
                    strMarkStatus = 'FAIL';

                let mark;
                if (arrStu[subIndx]['amark'] == -1)
                    mark = 'AB'
                else if (arrStu[subIndx]['amark'] == -2)
                    mark = 'OD'
                else
                    mark = arrStu[subIndx]['amark']

                strStudMark = strStudMark + arrStu[subIndx]['subjName'] + '-' + mark + '-' + strMarkStatus
            }

            let deptDet = strMentor + "-" + strMentorMobile + "-Mentor-" + strDept + "/" + strHOD + "-" + strHODMobile + "-HOD/" + strDept + "."
            let strMsg = "Greetings from FXEC! The " + strExam + " results " + strSemester + " sem of " + strStudName + " is " + strStudMark + ". " + deptDet
            console.log(strMsg + '\n')
            var opts =
            {
                sender: 'FXENGG',
                username: 'edp@francisxavier.ac.in',
                hash: '686586a8d24b961addece14b7c8c9fcbca0a151bd1ef8390a3c1b69d44edc587',
                numbers: JSON.stringify(stuMobile),
                message: strMsg,
                json: 1
            };
            request.post('https://api.textlocal.in/send', { form: opts }, function (err, res) {
                if (err) {
                    reqLogFile.PrintError(err);
                    console.log(regno + ' : ' + err);
                }
                asyncCallback();
            })
        } else {
            reqLogFile.PrintError('There is no MobileNo for RegisterNo : ' + regno);
            console.log('There is no MobileNo for RegisterNo : ' + regno);
            asyncCallback();
        }
    }, function (err) {
        if (err)
            reqLogFile.PrintError(err);
        callback();
    })

}

module.exports.orderinternalmarks = function (data, callback) {
    let sublist = [];
    let tempdata = [];
    for (let all of data) {
        if (sublist.indexOf(all.subject) != -1) {
            sublist.push(all.subject)
        }
    }
    for (let subj of sublist) {
        for (let all of data) {
            if (all.subject === subj) {
                if (tempdata.indexOf(all.number) != -1) {
                    tempdata.push(all.number)
                }
            }
        }
    }
}

module.exports.sliceLast = function (data, callback) {
    var ress = [];
    reqLogFile.PrintInfo(data);
    if (data.length > 0) {
        for (i = 0; i < data.length - 2; i++) {
            ress.push(data[i]);
            if (i == data.length - 2) {
                reqLogFile.PrintInfo(ress);
                callback(ress);
            }
        }
    }
}

module.exports.assembleCLass = (rows, pIsAdmin, callback) => {
    let hrs = [];
    for (let all of rows[0]) {
        var arrSyllabus = rows[1].filter(function (pRow) {
            return pRow["Master_Subject_Code"] == all.Master_Sub_Code;
        });

        if (pIsAdmin == 1) { // if it is admin staff, then shows all attendance hours
            hrs.push({
                "id": all.TT_ID, "Date": all.Date, "hour": all.Hours, "subject": all.Master_Sub_Name, "subcode": all.Master_Sub_Code, "Course": all.Course_Acr, "batch": all.Batch_Year, "section": all.Section,
                "isAttendCompleted": all.entryStatus, "topicCovered": all.Topic_covered, "unitNo": all.Unit_id, "Syllabus": arrSyllabus
            })
        } else { // if it is staff, then shows all attendance hours to be enter the attendance
            if ((all.Is_Locked && all.Is_Locked == '0') || (all.Attend_entry_lock == null || all.Attend_entry_lock == '0')) /* If No LOCK */ {
                hrs.push({
                    "id": all.TT_ID, "Date": all.Date, "hour": all.Hours, "subject": all.Master_Sub_Name, "subcode": all.Master_Sub_Code, "Course": all.Course_Acr, "batch": all.Batch_Year, "section": all.Section,
                    "isAttendCompleted": all.entryStatus, "topicCovered": all.Topic_covered, "unitNo": all.Unit_id, "Syllabus": arrSyllabus
                })
            } else if (all.Attend_entry_lock == '1') /* TIME BASED LOCK */ {
                let cnt = all.Start_Time + all.Time_duration;
                if (all.now < cnt && all.now >= all.Start_Time) {
                    hrs.push({
                        "id": all.TT_ID, "Date": all.Date, "hour": all.Hours, "subject": all.Master_Sub_Name, "subcode": all.Master_Sub_Code, "Course": all.Course_Acr, "batch": all.Batch_Year, "section": all.Section, "timing": 300, "isAttendCompleted": all.entryStatus,
                        "topicCovered": all.Topic_covered, "unitNo": all.Unit_id, "Syllabus": arrSyllabus
                    })
                }
            } else if (all.Attend_entry_lock == '2') /* HOUR BASED LOCK */ {
                if (all.now >= all.Start_Time && all.now < all.End_Time) {
                    hrs.push({
                        "id": all.TT_ID, "Date": all.Date, "hour": all.Hours, "subject": all.Master_Sub_Name, "subcode": all.Master_Sub_Code, "Course": all.Course_Acr, "batch": all.Batch_Year, "section": all.Section, "timing": 300,
                        "isAttendCompleted": all.entryStatus, "topicCovered": all.Topic_covered, "unitNo": all.Unit_id, "Syllabus": arrSyllabus
                    })
                }
            } else if (all.Attend_entry_lock == '3') /* DAY BASED LOCK */ {
                let sdt = moment(new Date()).format("YYYY-MM-DD");
                let edt = moment(all.Date).format("YYYY-MM-DD");
                if (sdt == edt) {
                    hrs.push({
                        "id": all.TT_ID, "Date": all.Date, "hour": all.Hours, "subject": all.Master_Sub_Name, "subcode": all.Master_Sub_Code, "Course": all.Course_Acr, "batch": all.Batch_Year, "section": all.Section,
                        "isAttendCompleted": all.entryStatus, "topicCovered": all.Topic_covered, "unitNo": all.Unit_id, "Syllabus": arrSyllabus
                    })
                }
            }
        }
    }
    callback(hrs);
}


/** To encrypt the staff and student code to access the url with encrypted one */
module.exports.DoEncryptCode = (pRows, pType, pCallback) => {
    let arrLst = [];
    arrLst.push({
        "ID": "00",
        "CODE": "defaultuser",
        "ENC_CODE": reqEncryption.EncryptCode("defaultuser"),
        "TYPE": pType.toString().toUpperCase()
    })
    for (var i = 0; i < pRows.length; i++) {
        arrLst.push({
            "ID": pRows[i]['ID'],
            "CODE": pRows[i]['CODE'],
            "ENC_CODE": reqEncryption.EncryptCode(pRows[i]['CODE']),
            "TYPE": pType.toString().toUpperCase()
        })
    }
    pCallback(arrLst);
}

/** to prepare a selflearning and assignment topic for a subject */
module.exports.GetPrepareTopic = (pTopics) => {
    let lstTopics = [];
    var units = pTopics.map(function (obj) { return obj.unit_id; });
    units = units.filter(function (v, i) { return units.indexOf(v) == i; });
    for (var j = 0; j < units.length; j++) {
        var arrTopics = pTopics.filter(function (topic) {
            return topic['unit_id'] == units[j];
        });
        let objTopic = {};
        if (arrTopics.length > 0) {
            objTopic = {
                "id": arrTopics[0]["id"],
                "unitNo": arrTopics[0]["unit_id"],
                "Topics": arrTopics[0]["topic"],
                "DOA": arrTopics[0]["DOA"],
                "DOS": arrTopics[0]["DOS"],
                "knowledgeLevel": arrTopics[0]["knowledge_level"]
            };
            var arrTopic = [];
            for (let i = 0; i < arrTopics.length; i++) {
                arrTopic.push({ "referenceId": arrTopics[i]["topic_reference_id"], "referenceType": arrTopics[i]["reference_type"] });
            }
            objTopic['references'] = arrTopic;
        }
        lstTopics.push(objTopic);
    }
    return lstTopics;
}

// To prepare CO BL mapping JSON object
// To prepare CO BL mapping JSON object
module.exports.PrepareCOBLMapping = (pRows) => {
    let objResult = {}, lstStudents = [];
    if (pRows[0].length > 0) {
        objResult = {
            'subjectId': pRows[0][0]['subjectId'],
            'testId': pRows[0][0]['testId'],
            "testAcr": pRows[0][0]['testName'],
            "testDate": moment(pRows[0][0]['testDate']).format("DD-MM-YYYY"),
            "testMaxMark": pRows[0][0]['testMaxMark'],
            "testStartTime": pRows[0][0]['testStartTime'],
            "testEndTime": pRows[0][0]['testEndTime'],
            "semester": pRows[0][0]['semester'].toString().padStart(2, '0'),
            "subCode": pRows[0][0]['subCode'],
            "subName": pRows[0][0]['subName'],
            "staffName": pRows[0][0]['staffName'],
            "staffDept": pRows[0][0]['staffDept'],
            "staffDesig": pRows[0][0]['staffDesig'],
            "clgName": pRows[0][0]['clgName'],
            "clgAddr": pRows[0][0]['clgAddr'],
            "stuDept": pRows[0][0]['stuDept'],
            "stuBatch": pRows[0][0]['stuBatch'],
            "stuSection": pRows[0][0]['stuSection']

        }

        let blnUpdated = true;
        __CalculateCoBloomTotal(objResult, JSON.parse(pRows[0][0]['courseOutcomeBloom']), pRows[1]);
        for (let i = 0; i < pRows[0].length; i++) {
            let objStudent = {
                "registerNumber": pRows[0][i]['regNo'],
                "studentName": pRows[0][i]['studName'],
                "IATMark": pRows[0][i]['IATMark']
            }
            if (pRows[0][i]['studCoBl'] == null)
                blnUpdated = false;

            __StudentCoBloomQuestions(objStudent, JSON.parse(pRows[0][i]['courseOutcomeBloom']), pRows[0][i]['studCoBl'], pRows[1])
            lstStudents.push(objStudent);
        }
        objResult['studentList'] = lstStudents;
        objResult["blnUpdated"] = blnUpdated

    }
    return objResult;
}

function __StudentCoBloomQuestions(pStu, pCoBl, pStudCoBl, pMarks) {
    if (pStudCoBl != null && pCoBl != null) { // if added student co bl mark
        let lstStudCoBl = JSON.parse(pStudCoBl)
        let objQuestions = {}
        for (let k = 0; k < lstStudCoBl.length; k++) {

            let arrTemp = pCoBl.filter(function (obj) {
                return obj['questId'] == lstStudCoBl[k]['questId']
            })
            if (arrTemp.length > 0) {
                lstStudCoBl[k]['co'] = arrTemp[0]['co']
                lstStudCoBl[k]['bl'] = arrTemp[0]['bl']
            }
            let arrTempMark = pMarks.filter(function (obj) {
                return obj['questId'] == lstStudCoBl[k]['questId']
            })
            if (arrTempMark.length > 0) {
                lstStudCoBl[k]['maxMark'] = arrTempMark[0]['mark']
            }
            objQuestions[arrTemp[0]['questNo']] = lstStudCoBl[k];
        }
        pStu['qnList'] = objQuestions;
    } else { // if not added student co bl mark
        let objQuestions = {}
        if (pCoBl) {
            for (indx = 0; indx < pCoBl.length; indx++) {
                let arrTemp = pMarks.filter(function (obj) { return obj.questId == pCoBl[indx]['questId'] })

                objQuestions[pCoBl[indx]['questNo']] = {
                    "questNo": pCoBl[indx]['questNo'],
                    "questId": pCoBl[indx]['questId'],
                    "maxMark": arrTemp[0]['mark'],
                    "actMark": null,
                    "co": pCoBl[indx]['co'],
                    "bl": pCoBl[indx]['bl']
                }
            }
            pStu['qnList'] = objQuestions
        }
    }
}

function __CalculateCoBloomTotal(pStu, pCoBl, pMarks) {
    if (pCoBl) {
        let lstCOKeys = pCoBl.map(function (obj) { return obj.co; });
        let lstBLKeys = pCoBl.map(function (obj) { return obj.bl; });
        let lstMarkKeys = [];

        for (let k = 0; k < pCoBl.length; k++) {
            let arrMark = pMarks.filter(function (obj) {
                return obj.questId == pCoBl[k]['questId']
            })
            if (arrMark.length > 0)
                lstMarkKeys.push(arrMark[0]['mark'])
        }

        pStu['coKeys'] = lstCOKeys;
        pStu['blKeys'] = lstBLKeys;
        pStu['markKeys'] = lstMarkKeys;

        // To get unique CO numbers
        let lstUniqueCO = pCoBl.map(function (obj) { return obj.co; });
        lstUniqueCO = lstUniqueCO.filter(function (v, i) { return lstUniqueCO.indexOf(v) == i; });

        // To get unique BL numbers
        let lstUniqueBL = pCoBl.map(function (obj) { return obj.bl; });
        lstUniqueBL = lstUniqueBL.filter(function (v, i) { return lstUniqueBL.indexOf(v) == i; });

        let lstCO = [], lstBL = [];
        // To find CO total
        for (indx = 0; indx < lstUniqueCO.length; indx++) {
            let arrCO = pCoBl.filter(function (obj) {
                return obj.co == lstUniqueCO[indx]
            })
            let strCOKey = 'CO' + lstUniqueCO[indx].toString()
            let strCOTotal = 0;
            for (let i = 0; i < arrCO.length; i++) {

                let arrMark = pMarks.filter(function (obj) {
                    return obj.questId == arrCO[i]['questId']
                })
                if (arrMark.length > 0)
                    strCOTotal = strCOTotal + arrMark[0]['mark']
            }
            lstCO.push({
                "name": strCOKey + " (" + strCOTotal + ")",
                "id": lstUniqueCO[indx],
                "value": 0,
                "totalMark": strCOTotal
            })
        }
        pStu['coList'] = lstCO

        // To find BL total
        for (indx = 0; indx < lstUniqueBL.length; indx++) {
            let arrBL = pCoBl.filter(function (obj) {
                return obj.bl == lstUniqueBL[indx]
            })

            let strBLKey = lstUniqueBL[indx].toString()

            let strBLTotal = 0;
            for (let i = 0; i < arrBL.length; i++) {
                let arrMark = pMarks.filter(function (obj) {
                    return obj.questId == arrBL[i]['questId']
                })
                if (arrMark.length > 0)
                    strBLTotal = strBLTotal + arrMark[0]['mark']
            }

            lstBL.push({
                "name": strBLKey + " (" + strBLTotal + ")",
                "id": lstUniqueBL[indx],
                "value": 0
            })
        }
        pStu['blList'] = lstBL;
    }
}
module.exports.PrepareInternalEntryStatus = function (pRows, callback) {
    let lstResult = {};
    if (pRows[0].length > 0) {

        let arrCourseList = pRows[0].map(function (obj) { return obj.courseId });
        arrCourseList = arrCourseList.filter((value, index, self) => self.indexOf(value) == index)
        for (let courseIndex = 0; courseIndex < arrCourseList.length; courseIndex++) {

            // get all course list
            let arrCourse = pRows[0].filter(function (item1, pos1) {
                return item1.courseId == arrCourseList[courseIndex];
            });

            // get unique batch list
            let arrBatchList = arrCourse.map(item => item.stuBatch).filter((value, index, self) => self.indexOf(value) === index)

            let lstBatchs = [];
            for (let batchIndex = 0; batchIndex < arrBatchList.length; batchIndex++) {
                // get all batch list
                let arrBatch = arrCourse.filter(function (item1, pos1) {
                    return item1.stuBatch == arrBatchList[batchIndex];
                });

                let arrSectionList = arrBatch.map(item => item.stuSection).filter((value, index, self) => self.indexOf(value) === index)

                for (let secIndex = 0; secIndex < arrSectionList.length; secIndex++) {

                    // get all batch list
                    let arrSection = arrBatch.filter(function (item1, pos1) {
                        return item1.stuSection == arrSectionList[secIndex];
                    });

                    // get all subject in the particular section
                    let arrSubjectList = arrSection.map(item => item.subId).filter((value, index, self) => self.indexOf(value) === index)

                    let lstSubjects = [];
                    for (let subIndx = 0; subIndx < arrSubjectList.length; subIndx++) {
                        let strPassPercentage = '';
                        // get all students list
                        let arrStudents = arrSection.filter(function (item1, pos1) {
                            return item1.subId == arrSubjectList[subIndx];
                        });

                        let arrStuMarkEntered = arrStudents.filter(function (item, pos) {
                            return item['actMark'] == -10;
                        })

                        // if test mark is not entered
                        if (arrStuMarkEntered.length == arrStudents.length) {
                            strPassPercentage = '-'
                        } else {
                            let arrPassedStu = arrStudents.filter(function (item, pos) {
                                return item['actMark'] >= 50;
                            })

                            strPassPercentage = (arrPassedStu.length / arrStudents.length) * 100
                        }

                        lstSubjects.push({
                            "subCode": arrStudents[0]['subCode'],
                            "subName": arrStudents[0]['subName'],
                            "subHandledBy": arrStudents[0]['subHandledBy'],
                            "staffDesig": arrStudents[0]['staffDesig'],
                            "photoUrl": arrStudents[0]['photoUrl'],
                            "passPercentage": (strPassPercentage != '-') ? parseFloat(strPassPercentage).toFixed(2) : strPassPercentage
                        })
                    }
                    lstBatchs.push({
                        "batch": arrBatchList[batchIndex] + " - " + arrSection[0]['stuSection'],
                        "subjects": lstSubjects
                    })
                }
            }
            lstResult = {
                "testName": pRows[0][0]['testName'],
                "batchs": lstBatchs
            }
        }
    }
    return lstResult;
}

/**************************Permission Service related public function ********************* */

module.exports.PrepareUserAccessPermission = (pRows, userType) => {
    let lstUsers = pRows[0].map(function (obj) {
        if (userType === "staff") {
            return { "userCode": obj.userCode, "userName": obj.userName, "userEncUrl": obj.userEncUrl, "userDesig": obj.userDesig, "staffDept": obj.staffDept, "staffType": obj.staffType };
        } else {
            return { "userCode": obj.userCode, "userName": obj.userName, "userEncUrl": obj.userEncUrl, "sectionName": obj.studSection, "batchYear": obj.batchYear, "courseName": obj.courseName };
        }
    });
    lstUsers = lstUsers.filter((value, index, self) => self.map(x => x.userCode).indexOf(value.userCode) == index)

    let lstUserList = [];
    for (let userIndx = 0; userIndx < lstUsers.length; userIndx++) {

        let lstUser = pRows[0].filter(obj => { return obj['userCode'] == lstUsers[userIndx]['userCode'] })

        // filter master pages for the current staff
        let lstMasterPages = lstUser.filter(obj => { return obj['pageType'] == "M" })

        // filter subpage sections
        let lstSubPageSections = lstUser.filter(obj => { return obj['pageType'] == "S" });
        lstSubPageSections = lstSubPageSections.map(obj => { return obj.sectionName })
            .filter((value, index, self) => self.indexOf(value) === index);

        let lstMasterList = [];
        for (let masIndx = 0; masIndx < lstMasterPages.length; masIndx++) {

            let objSubPage = { "pageCode": lstMasterPages[masIndx]["pageCode"], "pageName": lstMasterPages[masIndx]["pageName"] };
            let lstSubPageList = [];
            for (let secIndx = 0; secIndx < lstSubPageSections.length; secIndx++) {

                let lstSubPages = lstUser.filter(obj => {
                    return obj['masterPageCode'] == lstMasterPages[masIndx]['pageCode'] && obj['sectionName'] == lstSubPageSections[secIndx]
                }).map(item => {
                    return { "subPageCode": item["pageCode"], "subPageName": item["pageName"] }
                });

                if (lstSubPages.length > 0) // if subpage rights exist
                    lstSubPageList.push({ "name": lstSubPageSections[secIndx], "list": lstSubPages })
            }
            objSubPage["subPageList"] = lstSubPageList;
            lstMasterList.push(objSubPage);
        }
        if (userType === "staff") {
            lstUserList.push({
                "userCode": lstUsers[userIndx]['userCode'],
                "userName": lstUsers[userIndx]['userName'],
                "userEncUrl": lstUsers[userIndx]['userEncUrl'],
                "userDesig": lstUsers[userIndx]['userDesig'],
                "staffDept": lstUsers[userIndx]['staffDept'],
                "staffType": lstUsers[userIndx]['staffType'],
                "permList": lstMasterList
            })
        } else {
            lstUserList.push({
                "userCode": lstUsers[userIndx]['userCode'],
                "userName": lstUsers[userIndx]['userName'],
                "userEncUrl": lstUsers[userIndx]['userEncUrl'],
                "courseName": lstUsers[userIndx]['courseName'],
                "batchYear": lstUsers[userIndx]['batchYear'],
                "sectionName": lstUsers[userIndx]['sectionName'],
                "permList": lstMasterList
            })
        }
    }

    // Prepare overall user access permission list
    let mPermList = pRows[1];
    let mPermissions = [];
    mPermList.forEach((item) => {
        let mSplitPerm = {
            "pageCode": item.masterPageCode,
            "pageName": item.masterPageName,
            "subPageList": [
                {
                    "name": item.SubPageSectionName,
                    "list": [
                        {
                            "subPageCode": item.subPageCode,
                            "subPageName": item.SubPageOptionName
                        }
                    ]
                }
            ]
        }
        let mIndex = mPermissions.findIndex((perm) => perm.pageCode === mSplitPerm.pageCode);
        if (mIndex === -1) {
            mPermissions.push(mSplitPerm);
        } else {
            let mIndx = mPermissions[mIndex].subPageList.findIndex((perm) => perm.name === item.SubPageSectionName);
            if (mIndx === -1) {
                mPermissions[mIndex].subPageList.push(mSplitPerm.subPageList[0]);
            } else {
                mPermissions[mIndex].subPageList[mIndx].list.push(mSplitPerm.subPageList[0].list[0]);
            }
        }
    })
    return { "staffPermissions": lstUserList, "overallPermissions": mPermissions };
}


/****************************Feedback Service********************** */

module.exports.PrepareEvaluationReportBySubwise = (pRows) => {
    let lstSubject = [];
    if (pRows[0].length > 0) {
        // To get total students
        let arrTotalStudents = pRows[0].map(function (obj) { return obj.regNo; });
        arrTotalStudents = arrTotalStudents.filter(function (v, i) { return arrTotalStudents.indexOf(v) == i; });

        // to get total students who are answered the feedback
        let arrTempStudents = pRows[0].filter(function (obj) {
            return obj['questAns'] != null
        })
        let arrStudents = arrTempStudents.map(function (obj) { return obj.regNo; });
        arrStudents = arrStudents.filter((value, index, self) => self.map(x => x).indexOf(value) == index)

        let strTotalQuest = 0;

        let arrQuestionGrp = pRows[1].map(function (obj) { return obj.questGroup; });
        arrQuestionGrp = arrQuestionGrp.filter(function (v, i) { return arrQuestionGrp.indexOf(v) == i; });
        let lstQuestGroup = [];
        let strQrpTotal = 0;
        for (let k = 0; k < arrQuestionGrp.length; k++) {
            let lstQuestions = pRows[1].filter(function (obj) {
                return obj['questGroup'] == arrQuestionGrp[k]
            });

            let arrUniqueQuestions = lstQuestions.map(function (obj) { return obj.questionId; });
            arrUniqueQuestions = arrUniqueQuestions.filter(function (v, i) { return arrUniqueQuestions.indexOf(v) == i; });
            let arrQuest = [];
            let strQuestTotal = 0;
            strTotalQuest = arrUniqueQuestions.length;

            for (let i = 0; i < arrUniqueQuestions.length; i++) {
                let lstQuest = lstQuestions.filter(function (item) {
                    return item['questionId'] == arrUniqueQuestions[i]
                });

                let strTotal = 0;
                for (let stuIndx = 0; stuIndx < arrStudents.length; stuIndx++) {
                    let lstStudent = pRows[0].filter(function (obj) {
                        return obj.regNo == arrStudents[stuIndx]
                    })

                    let lstAnswer = JSON.parse(lstStudent[0]['questAns']).filter(function (obj) {
                        return obj.questionId == arrUniqueQuestions[i]
                    })

                    if (lstAnswer.length > 0) {
                        let tmpAnswer = lstQuestions.filter(function (obj) {
                            return obj.answerId == lstAnswer[0]['answerId']
                        })
                        strTotal = strTotal + parseInt(tmpAnswer[0]['answer'])
                    }
                }
                arrQuest.push({
                    "questionId": lstQuest[0]['questionId'], "question": lstQuest[0]['question'],
                    "questEvaluation": parseFloat(Number.isNaN(strTotal / arrStudents.length) ? 0 : (strTotal / arrStudents.length)).toFixed(2)
                })
                strQuestTotal = strQuestTotal + strTotal;
            }
            let strGrpEval = strQuestTotal / (arrUniqueQuestions.length * arrStudents.length);
            lstQuestGroup.push({
                "grpName": arrQuestionGrp[k],
                "grpEval": parseFloat(Number.isNaN(strGrpEval) ? 0 : strGrpEval).toFixed(2),
                "questions": arrQuest
            })
            strQrpTotal = strQrpTotal + strQuestTotal;
        }

        let strOverallEval = strQrpTotal / (strTotalQuest * arrStudents.length);

        // let hodSignatureUrl = '';
        // if (pRows[2].length > 0)
        //     hodSignatureUrl = pRows[2][0]['hodSignature'];

        lstSubject.push({
            "academicYear": pRows[0][0]['academicYear'],
            "staffDeptAcr": pRows[0][0]['staffDeptAcr'],
            "staffDept": pRows[0][0]['staffDept'],
            "staffTitle": pRows[0][0]['staffTitle'],
            "staffName": pRows[0][0]['staffName'],
            "staffDesig": pRows[0][0]['staffDesig'],
            "encUrl": pRows[0][0]['encUrl'],
            // "hodSignatureUrl": hodSignatureUrl,
            "subj_test_Id": pRows[0][0]['semsubjId'],
            "stuDept": pRows[0][0]['stuDept'],
            "stuBatch": pRows[0][0]['stuBatch'],
            "stuSection": pRows[0][0]['section'],
            "subCode": pRows[0][0]['subCode'],
            "subName": pRows[0][0]['subName'],
            "section": pRows[0][0]['section'],
            "semester": pRows[0][0]['semester'].padStart(2, '0'),
            "totalStudents": arrTotalStudents.length,
            "appearedStudents": arrStudents.length,
            "overallEval": parseFloat(Number.isNaN(strOverallEval) ? 0 : strOverallEval).toFixed(2),
            "questGrp": lstQuestGroup
        })
    }

    return lstSubject;
}

module.exports.PrepareDeptEvaluationReport = (pRows) => {
    let lstResult = [];
    if (pRows[0].length > 0) {

        let arrCourseList = pRows[0].map(function (obj) { return obj.courseId });
        arrCourseList = arrCourseList.filter((value, index, self) => self.indexOf(value) == index)
        for (let courseIndex = 0; courseIndex < arrCourseList.length; courseIndex++) {

            // get all course list
            let arrCourse = pRows[0].filter(function (item1, pos1) {
                return item1.courseId == arrCourseList[courseIndex];
            });

            // get unique batch list
            let arrBatchList = arrCourse.map(item => item.batchId).filter((value, index, self) => self.indexOf(value) === index)

            for (let batchIndex = 0; batchIndex < arrBatchList.length; batchIndex++) {
                // get all batch list
                let arrBatch = arrCourse.filter(function (item1, pos1) {
                    return item1.batchId == arrBatchList[batchIndex];
                });

                let arrSectionList = arrBatch.map(item => item.section).filter((value, index, self) => self.indexOf(value) === index)

                for (let secIndex = 0; secIndex < arrSectionList.length; secIndex++) {

                    // get all batch list
                    let arrSection = arrBatch.filter(function (item1, pos1) {
                        return item1.section == arrSectionList[secIndex];
                    });
                    // To prepare for a one class and section
                    let objSection = this.PrepareEvaluationReportByClasswise([arrSection, pRows[1]]);
                    lstResult.push(objSection);
                }
            }
        }
    }
    return lstResult;
}

module.exports.PrepareEvaluationReportByClasswise = (pRows) => {
    let objResult = {};
    if (pRows[0].length > 0) {

        // to get overall students 
        let arrTotalStudents = pRows[0].map(function (obj) { return obj.regNo; });
        arrTotalStudents = arrTotalStudents.filter(function (v, i) { return arrTotalStudents.indexOf(v) == i; });

        let arrSubjects = pRows[0].map(function (obj) { return obj.subCode; });
        arrSubjects = arrSubjects.filter(function (v, i) { return arrSubjects.indexOf(v) == i; });

        let arrUniqueQuestions = pRows[1].map(function (obj) { return obj.questionId; });
        arrUniqueQuestions = arrUniqueQuestions.filter(function (v, i) { return arrUniqueQuestions.indexOf(v) == i; });

        let strTotalQuest = arrUniqueQuestions.length;
        let lstSubjects = [], strFinalTotal = 0, strFinalStudents = 0;

        for (let subIndx = 0; subIndx < arrSubjects.length; subIndx++) {

            let lstSubject = pRows[0].filter(function (item) {
                return item['subCode'] == arrSubjects[subIndx]
            });

            // to get total students who are answered the feedback
            let arrTempStudents = lstSubject.filter(function (obj) {
                return obj['questAns'] != null
            })
            let arrStudents = arrTempStudents.map(function (obj) { return obj.regNo; });
            arrStudents = arrStudents.filter((value, index, self) => self.map(x => x).indexOf(value) == index)

            let strSubTotal = 0;

            for (let stuIndx = 0; stuIndx < arrStudents.length; stuIndx++) {
                let lstStudent = lstSubject.filter(function (obj) {
                    return obj.regNo == arrStudents[stuIndx]
                })

                let arrStuQuestAns = JSON.parse(lstStudent[0]['questAns']);
                for (let i = 0; i < arrUniqueQuestions.length; i++) {

                    let lstAnswer = arrStuQuestAns.filter(function (obj) {
                        return obj.questionId == arrUniqueQuestions[i];
                    })

                    if (lstAnswer.length > 0) {
                        let tmpAnswer = pRows[1].filter(function (obj) {
                            return obj.questionId == arrUniqueQuestions[i] && obj.answerId == lstAnswer[0]['answerId'];
                        })
                        strSubTotal = strSubTotal + parseInt(tmpAnswer[0]['answer']);
                    }
                }
            }

            let strSubEvaluation = strSubTotal / (strTotalQuest * arrStudents.length);
            lstSubjects.push({
                "subCode": lstSubject[0]['subCode'],
                "subName": lstSubject[0]['subName'],
                "subj_test_Id": lstSubject[0]['semsubjId'],
                "staffTitle": lstSubject[0]['staffTitle'],
                "staffName": lstSubject[0]['staffName'],
                "staffDesig": lstSubject[0]['staffDesig'],
                "encUrl": lstSubject[0]['encUrl'],
                "subEvaluation": parseFloat(Number.isNaN(strSubEvaluation) ? 0 : strSubEvaluation).toFixed(2)
            })
            strFinalTotal = strFinalTotal + strSubTotal;
            strFinalStudents = arrStudents.length;
        }
        let strClassEvaluation = strFinalTotal / (strTotalQuest * strFinalStudents * arrSubjects.length);
        objResult = {
            "academicYear": pRows[0][0]['academicYear'],
            "deptAcr": pRows[0][0]['deptAcr'],
            "deptName": pRows[0][0]['deptName'],
            "courseAcr": pRows[0][0]['courseAcr'],
            "courseDegree": pRows[0][0]['courseDegree'],
            "batchYear": pRows[0][0]['batchYear'],
            "section": pRows[0][0]['section'],
            "semester": pRows[0][0]['semester'].padStart(2, '0'),
            "totalStudents": arrTotalStudents.length,
            "appearedStudents": strFinalStudents,
            // "overallEval": parseFloat(Number.isNaN(strClassEvaluation) ? 0 : strClassEvaluation).toFixed(2),
            "subList": lstSubjects
        }
    }
    return objResult;
}

module.exports.PrepareEvaluationReportByDeptwise = (pRows) => {
    let lstResult = [];
    if (pRows[0].length > 0) {

        let arrCourseList = pRows[0].map(function (obj) { return obj.stuCourseId });
        arrCourseList = arrCourseList.filter((value, index, self) => self.map(x => x).indexOf(value) == index)
        for (let courseIndex = 0; courseIndex < arrCourseList.length; courseIndex++) {

            // get all course list
            let arrCourse = pRows[0].filter(function (item1, pos1) {
                return item1.stuCourseId == arrCourseList[courseIndex];
            });

            // get unique batch list
            let arrBatchList = arrCourse.map(item => item.stuBatchId).filter((value, index, self) => self.indexOf(value) === index)

            for (let batchIndex = 0; batchIndex < arrBatchList.length; batchIndex++) {
                // get all batch list
                let arrBatch = arrCourse.filter(function (item1, pos1) {
                    return item1.stuBatchId == arrBatchList[batchIndex];
                });

                // let arrSectionList = arrBatch.map(item => item.section).filter((value, index, self) => self.indexOf(value) === index)

                // for (let secIndex = 0; secIndex < arrSectionList.length; secIndex++) {

                //     // get all batch list
                //     let arrSection = arrBatch.filter(function (item1, pos1) {
                //         return item1.section == arrSectionList[secIndex];
                //     });

                // To get total students
                let arrTotalStudents = arrBatch.map(function (obj) { return obj.regNo; });
                arrTotalStudents = arrTotalStudents.filter(function (v, i) { return arrTotalStudents.indexOf(v) == i; });

                let lstSubject = arrBatch.map(function (obj) { return obj; });
                lstSubject = lstSubject.filter((value, index, self) => self.map(x => x.subCode).indexOf(value.subCode) == index)

                for (let subIndx = 0; subIndx < lstSubject.length; subIndx++) {
                    let lstStudents = arrBatch.filter(function (obj) {
                        return obj.subCode == lstSubject[subIndx]['subCode']
                    })

                    let arrSubjectsStaff = lstStudents.map(function (obj) { return obj.staffCode; });
                    arrSubjectsStaff = arrSubjectsStaff.filter(function (v, i) { return arrSubjectsStaff.indexOf(v) == i; });

                    for (let staffIndx = 0; staffIndx < arrSubjectsStaff.length; staffIndx++) {
                        let lstSubjectStaff = lstStudents.filter(function (item) {
                            return item['staffCode'] == arrSubjectsStaff[staffIndx]
                        });

                        // to get total students who are answered the feedback
                        let arrTempStudents = lstSubjectStaff.filter(function (obj) {
                            return obj['questAns'] != null
                        })
                        let arrStudents = arrTempStudents.map(function (obj) { return obj.regNo; });
                        arrStudents = arrStudents.filter((value, index, self) => self.map(x => x).indexOf(value) == index)

                        let strSubTotal = 0, strTotalQuest = 0, arrQuestions = [];

                        let arrQuestionGrp = pRows[1].map(function (obj) { return obj.questGroup; });
                        arrQuestionGrp = arrQuestionGrp.filter(function (v, i) { return arrQuestionGrp.indexOf(v) == i; });

                        for (let k = 0; k < arrQuestionGrp.length; k++) {
                            let lstQuestions = pRows[1].filter(function (obj) {
                                return obj['questGroup'] == arrQuestionGrp[k]
                            });

                            let arrUniqueQuestions = lstQuestions.map(function (obj) { return obj.questionId; });
                            arrUniqueQuestions = arrUniqueQuestions.filter(function (v, i) { return arrUniqueQuestions.indexOf(v) == i; });

                            strTotalQuest = strTotalQuest + arrUniqueQuestions.length;

                            for (let i = 0; i < arrUniqueQuestions.length; i++) {
                                let lstQuest = lstQuestions.filter(function (item) {
                                    return item['questionId'] == arrUniqueQuestions[i]
                                });
                                let strTotal = 0;
                                for (let stuIndx = 0; stuIndx < arrStudents.length; stuIndx++) {
                                    let lstStudent = lstSubjectStaff.filter(function (obj) {
                                        return obj.regNo == arrStudents[stuIndx]
                                    })

                                    let lstAnswer = JSON.parse(lstStudent[0]['questAns']).filter(function (obj) {
                                        return obj.questionId == arrUniqueQuestions[i]
                                    })

                                    if (lstAnswer.length > 0) {
                                        let tmpAnswer = lstQuestions.filter(function (obj) {
                                            return obj.answerId == lstAnswer[0]['answerId']
                                        })
                                        strTotal = strTotal + parseInt(tmpAnswer[0]['answer']);
                                    }
                                }
                                // add questions
                                let questEval = strTotal / arrStudents.length;
                                strSubTotal = strSubTotal + strTotal;

                                arrQuestions.push({
                                    "questionId": arrUniqueQuestions[i],
                                    "question": lstQuest[0]['question'],
                                    "questEvaluation": parseFloat(Number.isNaN(questEval) ? 0 : questEval).toFixed(2)
                                });
                            }
                        }

                        let arrSection = lstSubjectStaff.map(sec => { return sec["section"] }).filter((value, index, self) => self.map(x => x).indexOf(value) == index)

                        let strOverallEval = strSubTotal / (strTotalQuest * arrStudents.length);
                        lstResult.push({
                            "academicYear": lstSubjectStaff[0]['academicYear'],
                            "staffDeptAcr": lstSubjectStaff[0]['staffDeptAcr'],
                            "staffDept": lstSubjectStaff[0]['staffDept'],
                            "staffTitle": lstSubjectStaff[0]['staffTitle'],
                            "staffName": lstSubjectStaff[0]['staffName'],
                            "staffDesig": lstSubjectStaff[0]['staffDesig'],
                            "encUrl": lstSubjectStaff[0]['encUrl'],
                            "subj_test_Id": lstSubjectStaff[0]['semsubjId'],
                            "stuDept": lstSubjectStaff[0]['stuDept'],
                            "stuBatch": lstSubjectStaff[0]['stuBatch'],
                            "stuSection": arrSection.length > 0 ? arrSection.join(",") : "",
                            "subCode": lstSubjectStaff[0]['subCode'],
                            "subName": lstSubjectStaff[0]['subName'],
                            "section": lstSubjectStaff[0]['section'],
                            "semester": lstSubjectStaff[0]['semester'].padStart(2, '0'),
                            "totalStudents": lstSubjectStaff.length,
                            "appearedStudents": arrStudents.length,
                            "overallEval": parseFloat(Number.isNaN(strOverallEval) ? 0 : strOverallEval).toFixed(2),
                            "questList": arrQuestions
                        })
                    }
                }
            }
        }
    }

    // To Sort by staffName 
    lstResult.sort(function (a, b) {
        if (a['staffName'].toString().toUpperCase() > b['staffName'].toString().toUpperCase()) {
            return 1;
        } else if (a['staffName'].toString().toUpperCase() < b['staffName'].toString().toUpperCase()) {
            return -1;
        }
        return 0;
    });
    return lstResult;
}

module.exports.PrepareFeedbackPendingList = (pRows) => {
    let lstSection = [];
    if (pRows.length > 0) {

        let arrCourseList = pRows.map(function (obj) { return { "courseAcr": obj.courseAcr, "courseDegree": obj.courseDegree, "courseObj": (obj.courseDegree + '-' + obj.courseAcr) }; });
        arrCourseList = arrCourseList.filter((value, index, self) => self.map(x => x.courseObj).indexOf(value.courseObj) == index)
        for (let courseIndex = 0; courseIndex < arrCourseList.length; courseIndex++) {

            // get all course list
            let arrCourse = pRows.filter(function (item1, pos1) {
                return item1.courseAcr == arrCourseList[courseIndex]['courseAcr'] && item1.courseDegree == arrCourseList[courseIndex]['courseDegree'];
            });

            // get unique batch list
            let arrBatchList = arrCourse.map(item => item.batchYear).filter((value, index, self) => self.indexOf(value) === index)

            for (let batchIndex = 0; batchIndex < arrBatchList.length; batchIndex++) {
                // get all batch list
                let arrBatch = arrCourse.filter(function (item1, pos1) {
                    return item1.batchYear == arrBatchList[batchIndex];
                });

                let arrSectionList = arrBatch.map(item => item.section).filter((value, index, self) => self.indexOf(value) === index)

                for (let secIndex = 0; secIndex < arrSectionList.length; secIndex++) {

                    // get all batch list
                    let arrSection = arrBatch.filter(function (item1, pos1) {
                        return item1.section == arrSectionList[secIndex];
                    });

                    // get feedback pending students
                    let arrAnsweredStu = arrSection.filter(function (item1, pos1) {
                        return item1.questAns != null
                    });
                    arrAnsweredStu = arrAnsweredStu.filter((value, index, self) => self.map(x => x.regNo).indexOf(value.regNo) == index)

                    // get feedback pending students
                    let arrPendingStu = arrSection.filter(function (item1, pos1) {
                        return item1.questAns == null
                    });

                    for (let i = 0; i < arrAnsweredStu.length; i++) {
                        arrPendingStu = arrPendingStu.filter(function (obj) {
                            return obj.regNo != arrAnsweredStu[i]['regNo']
                        })
                    }
                    // get student list
                    let arrStudentList = arrPendingStu.map(item => { return { "regNo": item.regNo, "stuName": item.stuName, "stuMentor": item.stuMentor } });
                    arrStudentList = arrStudentList.filter((value, index, self) => self.map(x => x.regNo).indexOf(value.regNo) == index)

                    let arrPendingRegno = arrStudentList.map(item => { return item.regNo + "-" + item.stuName });

                    arrSection = arrSection.filter((value, index, self) => self.map(x => x.regNo).indexOf(value.regNo) == index)

                    lstSection.push({
                        "courseDegree": arrCourseList[courseIndex]['courseDegree'],
                        "courseAcr": arrCourseList[courseIndex]['courseAcr'],
                        "batch": arrBatchList[batchIndex],
                        "section": arrSectionList[secIndex],
                        "totalStu": arrSection.length,
                        "appearedStu": arrAnsweredStu.length,
                        "pendingStu": arrStudentList.length,
                        "stuList": arrStudentList
                    });
                }
            }
        }
    }
    return lstSection;
    // let lstSection = [];
    // if (pRows.length > 0) {

    //     let arrCourseList = pRows.map(function (obj) { return { "courseAcr": obj.courseAcr, "courseDegree": obj.courseDegree, "courseObj": (obj.courseDegree + '-' + obj.courseAcr) }; });
    //     arrCourseList = arrCourseList.filter((value, index, self) => self.map(x => x.courseObj).indexOf(value.courseObj) == index)
    //     for (let courseIndex = 0; courseIndex < arrCourseList.length; courseIndex++) {

    //         // get all course list
    //         let arrCourse = pRows.filter(function (item1, pos1) {
    //             return item1.courseAcr == arrCourseList[courseIndex]['courseAcr'] && item1.courseDegree == arrCourseList[courseIndex]['courseDegree'];
    //         });

    //         // get unique batch list
    //         let arrBatchList = arrCourse.map(item => item.batchYear).filter((value, index, self) => self.indexOf(value) === index)

    //         for (let batchIndex = 0; batchIndex < arrBatchList.length; batchIndex++) {
    //             // get all batch list
    //             let arrBatch = arrCourse.filter(function (item1, pos1) {
    //                 return item1.batchYear == arrBatchList[batchIndex];
    //             });

    //             let arrSectionList = arrBatch.map(item => item.section).filter((value, index, self) => self.indexOf(value) === index)

    //             for (let secIndex = 0; secIndex < arrSectionList.length; secIndex++) {

    //                 // get all batch list
    //                 let arrSection = arrBatch.filter(function (item1, pos1) {
    //                     return item1.section == arrSectionList[secIndex];
    //                 });

    //                 // get feedback pending students
    //                 let arrAnsweredStu = arrSection.filter(function (item1, pos1) {
    //                     return item1.questAns != null
    //                 });
    //                 arrAnsweredStu = arrAnsweredStu.filter((value, index, self) => self.map(x => x.regNo).indexOf(value.regNo) == index)

    //                 // get feedback pending students
    //                 let arrPendingStu = arrSection.filter(function (item1, pos1) {
    //                     return item1.questAns == null
    //                 });

    //                 // get student list
    //                 let arrStudentList = arrPendingStu.map(item => { return { "regNo": item.regNo, "stuName": item.stuName, "stuMentor": item.stuMentor } });
    //                 arrStudentList = arrStudentList.filter((value, index, self) => self.map(x => x.regNo).indexOf(value.regNo) == index)

    //                 let arrPendingRegno = arrStudentList.map(item => { return item.regNo + "-" + item.stuName });

    //                 arrSection = arrSection.filter((value, index, self) => self.map(x => x.regNo).indexOf(value.regNo) == index)

    //                 lstSection.push({
    //                     "courseDegree": arrCourseList[courseIndex]['courseDegree'],
    //                     "courseAcr": arrCourseList[courseIndex]['courseAcr'],
    //                     "batch": arrBatchList[batchIndex],
    //                     "section": arrSectionList[secIndex],
    //                     "totalStu": arrSection.length,
    //                     "appearedStu": arrAnsweredStu.length,
    //                     "pendingStu": arrStudentList.length,
    //                     "stuList": arrStudentList
    //                 });
    //             }
    //         }
    //     }
    // }
    // return lstSection;
}

module.exports.PrepareStaffEvaluationReport = (pRows) => {
    let lstResult = [];
    if (pRows[0].length > 0) {

        let arrStaffList = pRows[0].map(function (obj) { return obj });
        arrStaffList = arrStaffList.filter((value, index, self) => self.map(x => x.staffCode).indexOf(value.staffCode) == index)

        for (let staffIndx = 0; staffIndx < arrStaffList.length; staffIndx++) {
            let arrStaff = pRows[0].filter(function (obj) {
                return obj.staffCode == arrStaffList[staffIndx]['staffCode']
            })

            let arrFeedbackCategory = arrStaff.map(function (obj) { return obj });
            arrFeedbackCategory = arrFeedbackCategory.filter((value, index, self) => self.map(x => x.catName).indexOf(value.catName) == index).sort();

            let objFeedbackCategory = {};
            for (let catIndx = 0; catIndx < arrFeedbackCategory.length; catIndx++) {
                let arrCategory = arrStaff.filter(function (obj) {
                    return obj.catName == arrFeedbackCategory[catIndx]['catName']
                })

                let lstStaffSubjects = [];
                let arrCourseList = arrCategory.map(function (obj) { return obj.stuCourseId });
                arrCourseList = arrCourseList.filter((value, index, self) => self.map(x => x.stuCourseId).indexOf(value.stuCourseId) == index)
                for (let courseIndex = 0; courseIndex < arrCourseList.length; courseIndex++) {

                    // get all course list
                    let arrCourse = arrCategory.filter(function (item1, pos1) {
                        return item1.stuCourseId == arrCourseList[courseIndex];
                    });

                    // get unique batch list
                    let arrBatchList = arrCourse.map(item => item.stuBatchId).filter((value, index, self) => self.indexOf(value) === index)

                    for (let batchIndex = 0; batchIndex < arrBatchList.length; batchIndex++) {
                        // get all batch list
                        let arrBatch = arrCourse.filter(function (item1, pos1) {
                            return item1.stuBatchId == arrBatchList[batchIndex];
                        });

                        let arrSectionList = arrBatch.map(item => item.section).filter((value, index, self) => self.indexOf(value) === index)

                        for (let secIndex = 0; secIndex < arrSectionList.length; secIndex++) {

                            // get all batch list
                            let arrSection = arrBatch.filter(function (item1, pos1) {
                                return item1.section == arrSectionList[secIndex];
                            });

                            // To get total students
                            let arrTotalStudents = arrSection.map(function (obj) { return obj.regNo; });
                            arrTotalStudents = arrTotalStudents.filter(function (v, i) { return arrTotalStudents.indexOf(v) == i; });

                            let lstSubject = arrSection.map(function (obj) { return obj; });
                            lstSubject = lstSubject.filter((value, index, self) => self.map(x => x.subCode).indexOf(value.subCode) == index)

                            for (let subIndx = 0; subIndx < lstSubject.length; subIndx++) {
                                let lstStudents = arrSection.filter(function (obj) {
                                    return obj.subCode == lstSubject[subIndx]['subCode']
                                })

                                // to get total students who are answered the feedback
                                let arrTempStudents = lstStudents.filter(function (obj) {
                                    return obj['questAns'] != null
                                })
                                let arrStudents = arrTempStudents.map(function (obj) { return obj.regNo; });
                                arrStudents = arrStudents.filter((value, index, self) => self.map(x => x).indexOf(value) == index)

                                let strSubTotal = 0, strTotalQuest = 0, arrQuestions = [];

                                let arrQuestionGrp = pRows[1].map(function (obj) { return obj.questGroup; });
                                arrQuestionGrp = arrQuestionGrp.filter(function (v, i) { return arrQuestionGrp.indexOf(v) == i; });

                                for (let k = 0; k < arrQuestionGrp.length; k++) {
                                    let lstQuestions = pRows[1].filter(function (obj) {
                                        return obj['questGroup'] == arrQuestionGrp[k]
                                    });

                                    let arrUniqueQuestions = lstQuestions.map(function (obj) { return obj.questionId; });
                                    arrUniqueQuestions = arrUniqueQuestions.filter(function (v, i) { return arrUniqueQuestions.indexOf(v) == i; });

                                    strTotalQuest = strTotalQuest + arrUniqueQuestions.length;

                                    for (let i = 0; i < arrUniqueQuestions.length; i++) {
                                        let lstQuest = lstQuestions.filter(function (item) {
                                            return item['questionId'] == arrUniqueQuestions[i]
                                        });
                                        let strTotal = 0;
                                        for (let stuIndx = 0; stuIndx < arrStudents.length; stuIndx++) {
                                            let lstStudent = lstStudents.filter(function (obj) {
                                                return obj.regNo == arrStudents[stuIndx]
                                            })

                                            let lstAnswer = JSON.parse(lstStudent[0]['questAns']).filter(function (obj) {
                                                return obj.questionId == arrUniqueQuestions[i]
                                            })

                                            if (lstAnswer.length > 0) {
                                                let tmpAnswer = lstQuestions.filter(function (obj) {
                                                    return obj.answerId == lstAnswer[0]['answerId']
                                                })
                                                strTotal = strTotal + parseInt(tmpAnswer[0]['answer']);
                                            }
                                        }
                                        // add total of students answer
                                        strSubTotal = strSubTotal + strTotal;
                                    }
                                }

                                let strOverallEval = strSubTotal / (strTotalQuest * arrStudents.length);
                                lstStaffSubjects.push({
                                    "subj_test_Id": lstSubject[subIndx]['semsubjId'],
                                    "stuDept": lstSubject[subIndx]['stuDept'],
                                    "stuBatch": lstSubject[subIndx]['stuBatch'],
                                    "stuSection": lstSubject[subIndx]['section'],
                                    "subCode": lstSubject[subIndx]['subCode'],
                                    "subName": lstSubject[subIndx]['subName'],
                                    "section": lstSubject[subIndx]['section'],
                                    "semester": lstSubject[subIndx]['semester'].padStart(2, '0'),
                                    "totalStudents": arrTotalStudents.length,
                                    "appearedStudents": arrStudents.length,
                                    "overallEval": parseFloat(Number.isNaN(strOverallEval) ? 0 : strOverallEval).toFixed(2)
                                })
                            }
                        }
                    }
                }
                let strCatName = arrCategory[0]['catName'];
                objFeedbackCategory[strCatName] = lstStaffSubjects
            }
            let objStaff = {
                "staffDeptAcr": arrStaff[0]['staffDeptAcr'],
                "staffDept": arrStaff[0]['staffDept'],
                "staffTitle": arrStaff[0]['staffTitle'],
                "staffName": arrStaff[0]['staffName'],
                "staffDesig": arrStaff[0]['staffDesig'],
                "encUrl": arrStaff[0]['encUrl']
            }
            lstResult.push({ ...objStaff, ...objFeedbackCategory });
        }
    }
    // To Sort by staffName 
    lstResult.sort(function (a, b) {
        if (a['staffName'].toString().toUpperCase() > b['staffName'].toString().toUpperCase()) {
            return 1;
        } else if (a['staffName'].toString().toUpperCase() < b['staffName'].toString().toUpperCase()) {
            return -1;
        }
        return 0;
    });

    return lstResult;
}

module.exports.PrepareFeedbackSubjectList = (pRows) => {
    let lstSubject = [];
    if (pRows[0].length > 0) {
        let arrSubjects = pRows[0].map(function (obj) { return obj.subCode; });
        arrSubjects = arrSubjects.filter(function (v, i) { return arrSubjects.indexOf(v) == i; });

        for (let subIndx = 0; subIndx < arrSubjects.length; subIndx++) {

            let arrSubject = pRows[0].filter(function (obj) {
                return obj.subCode == arrSubjects[subIndx]
            });

            let arrQuestionGrp = pRows[1].map(function (obj) { return obj.questGroup; });
            arrQuestionGrp = arrQuestionGrp.filter(function (v, i) { return arrQuestionGrp.indexOf(v) == i; });
            let lstQuestGroup = [];
            for (let k = 0; k < arrQuestionGrp.length; k++) {
                let lstQuestions = pRows[1].filter(function (obj) {
                    return obj['questGroup'] == arrQuestionGrp[k]
                });
                let strFeedbackCategory = lstQuestions[0]['feedbackCategory'];
                let arrUniqueQuestions = lstQuestions.map(function (obj) { return obj.questionId; });
                arrUniqueQuestions = arrUniqueQuestions.filter(function (v, i) { return arrUniqueQuestions.indexOf(v) == i; });
                let arrQuest = [];

                for (let i = 0; i < arrUniqueQuestions.length; i++) {
                    let lstQuest = lstQuestions.filter(function (item) {
                        return item['questionId'] == arrUniqueQuestions[i]
                    });

                    let lstAnswer = JSON.parse(arrSubject[0]['questAns']).filter(function (obj) {
                        return obj.questionId == arrUniqueQuestions[i]
                    })
                    let strAnswerId = null; // if answered the question, set answer id
                    if (lstAnswer.length > 0)
                        strAnswerId = lstAnswer[0]['answerId'];

                    let arrAnswer = lstQuest.map(function (obj) { return { "answerId": obj.answerId, "answer": obj.answer }; });
                    arrQuest.push({
                        "questionId": lstQuest[0]['questionId'], "question": lstQuest[0]['question'], "value": strAnswerId, "answerList": arrAnswer
                    })
                }
                lstQuestGroup.push({
                    "grpName": arrQuestionGrp[k], "feedbackCategory": strFeedbackCategory, "questions": arrQuest
                })
            }

            lstSubject.push({
                "deptAcr": arrSubject[0]['deptAcr'],
                "deptName": arrSubject[0]['deptName'],
                "encUrl": arrSubject[0]['encUrl'],
                "subj_test_Id": arrSubject[0]['semsubjId'],
                "staffDesig": arrSubject[0]['staffDesig'],
                "staffName": arrSubject[0]['staffName'],
                "staffTitle": arrSubject[0]['staffTitle'],
                "subCode": arrSubject[0]['subCode'],
                "subName": arrSubject[0]['subName'],
                "questGrp": lstQuestGroup
            })
        }
    }
    return lstSubject;
}

// module.exports.PrepareEvaluationReportBySubwise = (pRows) => {
//     let lstSubject = [];
//     if (pRows[0].length > 0) {
//         // To get total students
//         let arrTotalStudents = pRows[0].map(function (obj) { return obj.regNo; });
//         arrTotalStudents = arrTotalStudents.filter(function (v, i) { return arrTotalStudents.indexOf(v) == i; });

//         // to get total students who are answered the feedback
//         let arrTempStudents = pRows[0].filter(function (obj) {
//             return obj['questAns'] != null
//         })
//         let arrStudents = arrTempStudents.map(function (obj) { return obj.regNo; });
//         arrStudents = arrStudents.filter((value, index, self) => self.map(x => x).indexOf(value) == index)

//         let strTotalQuest = 0;

//         let arrQuestionGrp = pRows[1].map(function (obj) { return obj.questGroup; });
//         arrQuestionGrp = arrQuestionGrp.filter(function (v, i) { return arrQuestionGrp.indexOf(v) == i; });
//         let lstQuestGroup = [];
//         let strQrpTotal = 0;
//         for (let k = 0; k < arrQuestionGrp.length; k++) {
//             let lstQuestions = pRows[1].filter(function (obj) {
//                 return obj['questGroup'] == arrQuestionGrp[k]
//             });

//             let arrUniqueQuestions = lstQuestions.map(function (obj) { return obj.questionId; });
//             arrUniqueQuestions = arrUniqueQuestions.filter(function (v, i) { return arrUniqueQuestions.indexOf(v) == i; });
//             let arrQuest = [];
//             let strQuestTotal = 0;
//             strTotalQuest = arrUniqueQuestions.length;

//             for (let i = 0; i < arrUniqueQuestions.length; i++) {
//                 let lstQuest = lstQuestions.filter(function (item) {
//                     return item['questionId'] == arrUniqueQuestions[i]
//                 });

//                 let strTotal = 0;
//                 for (let stuIndx = 0; stuIndx < arrStudents.length; stuIndx++) {
//                     let lstStudent = pRows[0].filter(function (obj) {
//                         return obj.regNo == arrStudents[stuIndx]
//                     })

//                     let lstAnswer = JSON.parse(lstStudent[0]['questAns']).filter(function (obj) {
//                         return obj.questionId == arrUniqueQuestions[i]
//                     })

//                     if (lstAnswer.length > 0) {
//                         let tmpAnswer = lstQuestions.filter(function (obj) {
//                             return obj.answerId == lstAnswer[0]['answerId']
//                         })
//                         strTotal = strTotal + parseInt(tmpAnswer[0]['answer'])
//                     }
//                 }
//                 arrQuest.push({
//                     "questionId": lstQuest[0]['questionId'], "question": lstQuest[0]['question'],
//                     "questEvaluation": parseFloat(Number.isNaN(strTotal / arrStudents.length) ? 0 : (strTotal / arrStudents.length)).toFixed(2)
//                 })
//                 strQuestTotal = strQuestTotal + strTotal;
//             }
//             let strGrpEval = strQuestTotal / (arrUniqueQuestions.length * arrStudents.length);
//             lstQuestGroup.push({
//                 "grpName": arrQuestionGrp[k],
//                 "grpEval": parseFloat(Number.isNaN(strGrpEval) ? 0 : strGrpEval).toFixed(2),
//                 "questions": arrQuest
//             })
//             strQrpTotal = strQrpTotal + strQuestTotal;
//         }

//         let strOverallEval = strQrpTotal / (strTotalQuest * arrStudents.length);

//         // let hodSignatureUrl = '';
//         // if (pRows[2].length > 0)
//         //     hodSignatureUrl = pRows[2][0]['hodSignature'];

//         lstSubject.push({
//             "academicYear": pRows[0][0]['academicYear'],
//             "staffDeptAcr": pRows[0][0]['staffDeptAcr'],
//             "staffDept": pRows[0][0]['staffDept'],
//             "staffTitle": pRows[0][0]['staffTitle'],
//             "staffName": pRows[0][0]['staffName'],
//             "staffDesig": pRows[0][0]['staffDesig'],
//             "encUrl": pRows[0][0]['encUrl'],
//             // "hodSignatureUrl": hodSignatureUrl,
//             "subj_test_Id": pRows[0][0]['semsubjId'],
//             "stuDept": pRows[0][0]['stuDept'],
//             "stuBatch": pRows[0][0]['stuBatch'],
//             "stuSection": pRows[0][0]['section'],
//             "subCode": pRows[0][0]['subCode'],
//             "subName": pRows[0][0]['subName'],
//             "section": pRows[0][0]['section'],
//             "semester": pRows[0][0]['semester'].padStart(2, '0'),
//             "totalStudents": arrTotalStudents.length,
//             "appearedStudents": arrStudents.length,
//             "overallEval": parseFloat(Number.isNaN(strOverallEval) ? 0 : strOverallEval).toFixed(2),
//             "questGrp": lstQuestGroup
//         })
//     }

//     return lstSubject;
// }

// module.exports.PrepareDeptEvaluationReport = (pRows) => {
//     let lstResult = [];
//     if (pRows[0].length > 0) {

//         let arrCourseList = pRows[0].map(function (obj) { return obj.courseId });
//         arrCourseList = arrCourseList.filter((value, index, self) => self.indexOf(value) == index)
//         for (let courseIndex = 0; courseIndex < arrCourseList.length; courseIndex++) {

//             // get all course list
//             let arrCourse = pRows[0].filter(function (item1, pos1) {
//                 return item1.courseId == arrCourseList[courseIndex];
//             });

//             // get unique batch list
//             let arrBatchList = arrCourse.map(item => item.batchId).filter((value, index, self) => self.indexOf(value) === index)

//             for (let batchIndex = 0; batchIndex < arrBatchList.length; batchIndex++) {
//                 // get all batch list
//                 let arrBatch = arrCourse.filter(function (item1, pos1) {
//                     return item1.batchId == arrBatchList[batchIndex];
//                 });

//                 let arrSectionList = arrBatch.map(item => item.section).filter((value, index, self) => self.indexOf(value) === index)

//                 for (let secIndex = 0; secIndex < arrSectionList.length; secIndex++) {

//                     // get all batch list
//                     let arrSection = arrBatch.filter(function (item1, pos1) {
//                         return item1.section == arrSectionList[secIndex];
//                     });
//                     // To prepare for a one class and section
//                     let objSection = this.PrepareEvaluationReportByClasswise([arrSection, pRows[1]]);
//                     lstResult.push(objSection);
//                 }
//             }
//         }
//     }
//     return lstResult;
// }

// module.exports.PrepareEvaluationReportByClasswise = (pRows) => {
//     let objResult = {};
//     if (pRows[0].length > 0) {

//         // to get overall students 
//         let arrTotalStudents = pRows[0].map(function (obj) { return obj.regNo; });
//         arrTotalStudents = arrTotalStudents.filter(function (v, i) { return arrTotalStudents.indexOf(v) == i; });

//         let arrSubjects = pRows[0].map(function (obj) { return obj.subCode; });
//         arrSubjects = arrSubjects.filter(function (v, i) { return arrSubjects.indexOf(v) == i; });

//         let arrUniqueQuestions = pRows[1].map(function (obj) { return obj.questionId; });
//         arrUniqueQuestions = arrUniqueQuestions.filter(function (v, i) { return arrUniqueQuestions.indexOf(v) == i; });

//         let strTotalQuest = arrUniqueQuestions.length;
//         let lstSubjects = [], strFinalTotal = 0, strFinalStudents = 0;

//         for (let subIndx = 0; subIndx < arrSubjects.length; subIndx++) {

//             let lstSubject = pRows[0].filter(function (item) {
//                 return item['subCode'] == arrSubjects[subIndx]
//             });

//             // to get total students who are answered the feedback
//             let arrTempStudents = lstSubject.filter(function (obj) {
//                 return obj['questAns'] != null
//             })
//             let arrStudents = arrTempStudents.map(function (obj) { return obj.regNo; });
//             arrStudents = arrStudents.filter((value, index, self) => self.map(x => x).indexOf(value) == index)

//             let strSubTotal = 0;

//             for (let stuIndx = 0; stuIndx < arrStudents.length; stuIndx++) {
//                 let lstStudent = lstSubject.filter(function (obj) {
//                     return obj.regNo == arrStudents[stuIndx]
//                 })

//                 let arrStuQuestAns = JSON.parse(lstStudent[0]['questAns']);
//                 for (let i = 0; i < arrUniqueQuestions.length; i++) {

//                     let lstAnswer = arrStuQuestAns.filter(function (obj) {
//                         return obj.questionId == arrUniqueQuestions[i];
//                     })

//                     if (lstAnswer.length > 0) {
//                         let tmpAnswer = pRows[1].filter(function (obj) {
//                             return obj.questionId == arrUniqueQuestions[i] && obj.answerId == lstAnswer[0]['answerId'];
//                         })
//                         strSubTotal = strSubTotal + parseInt(tmpAnswer[0]['answer']);
//                     }
//                 }
//             }

//             let strSubEvaluation = strSubTotal / (strTotalQuest * arrStudents.length);
//             lstSubjects.push({
//                 "subCode": lstSubject[0]['subCode'],
//                 "subName": lstSubject[0]['subName'],
//                 "subj_test_Id": lstSubject[0]['semsubjId'],
//                 "staffTitle": lstSubject[0]['staffTitle'],
//                 "staffName": lstSubject[0]['staffName'],
//                 "staffDesig": lstSubject[0]['staffDesig'],
//                 "encUrl": lstSubject[0]['encUrl'],
//                 "subEvaluation": parseFloat(Number.isNaN(strSubEvaluation) ? 0 : strSubEvaluation).toFixed(2)
//             })
//             strFinalTotal = strFinalTotal + strSubTotal;
//             strFinalStudents = arrStudents.length;
//         }
//         let strClassEvaluation = strFinalTotal / (strTotalQuest * strFinalStudents * arrSubjects.length);
//         objResult = {
//             "academicYear": pRows[0][0]['academicYear'],
//             "deptAcr": pRows[0][0]['deptAcr'],
//             "deptName": pRows[0][0]['deptName'],
//             "courseAcr": pRows[0][0]['courseAcr'],
//             "courseDegree": pRows[0][0]['courseDegree'],
//             "batchYear": pRows[0][0]['batchYear'],
//             "section": pRows[0][0]['section'],
//             "semester": pRows[0][0]['semester'].padStart(2, '0'),
//             "totalStudents": arrTotalStudents.length,
//             "appearedStudents": strFinalStudents,
//             // "overallEval": parseFloat(Number.isNaN(strClassEvaluation) ? 0 : strClassEvaluation).toFixed(2),
//             "subList": lstSubjects
//         }
//     }
//     return objResult;
// }

// module.exports.PrepareEvaluationReportByDeptwise = (pRows) => {
//     let lstResult = [];
//     if (pRows[0].length > 0) {

//         let arrCourseList = pRows[0].map(function (obj) { return obj.stuCourseId });
//         arrCourseList = arrCourseList.filter((value, index, self) => self.map(x => x.stuCourseId).indexOf(value.stuCourseId) == index)
//         for (let courseIndex = 0; courseIndex < arrCourseList.length; courseIndex++) {

//             // get all course list
//             let arrCourse = pRows[0].filter(function (item1, pos1) {
//                 return item1.stuCourseId == arrCourseList[courseIndex];
//             });

//             // get unique batch list
//             let arrBatchList = arrCourse.map(item => item.stuBatchId).filter((value, index, self) => self.indexOf(value) === index)

//             for (let batchIndex = 0; batchIndex < arrBatchList.length; batchIndex++) {
//                 // get all batch list
//                 let arrBatch = arrCourse.filter(function (item1, pos1) {
//                     return item1.stuBatchId == arrBatchList[batchIndex];
//                 });

//                 let arrSectionList = arrBatch.map(item => item.section).filter((value, index, self) => self.indexOf(value) === index)

//                 for (let secIndex = 0; secIndex < arrSectionList.length; secIndex++) {

//                     // get all batch list
//                     let arrSection = arrBatch.filter(function (item1, pos1) {
//                         return item1.section == arrSectionList[secIndex];
//                     });

//                     // To get total students
//                     let arrTotalStudents = arrSection.map(function (obj) { return obj.regNo; });
//                     arrTotalStudents = arrTotalStudents.filter(function (v, i) { return arrTotalStudents.indexOf(v) == i; });

//                     let lstSubject = arrSection.map(function (obj) { return obj; });
//                     lstSubject = lstSubject.filter((value, index, self) => self.map(x => x.subCode).indexOf(value.subCode) == index)

//                     for (let subIndx = 0; subIndx < lstSubject.length; subIndx++) {
//                         let lstStudents = arrSection.filter(function (obj) {
//                             return obj.subCode == lstSubject[subIndx]['subCode']
//                         })

//                         // to get total students who are answered the feedback
//                         let arrTempStudents = lstStudents.filter(function (obj) {
//                             return obj['questAns'] != null
//                         })
//                         let arrStudents = arrTempStudents.map(function (obj) { return obj.regNo; });
//                         arrStudents = arrStudents.filter((value, index, self) => self.map(x => x).indexOf(value) == index)

//                         let strSubTotal = 0, strTotalQuest = 0, arrQuestions = [];

//                         let arrQuestionGrp = pRows[1].map(function (obj) { return obj.questGroup; });
//                         arrQuestionGrp = arrQuestionGrp.filter(function (v, i) { return arrQuestionGrp.indexOf(v) == i; });

//                         for (let k = 0; k < arrQuestionGrp.length; k++) {
//                             let lstQuestions = pRows[1].filter(function (obj) {
//                                 return obj['questGroup'] == arrQuestionGrp[k]
//                             });

//                             let arrUniqueQuestions = lstQuestions.map(function (obj) { return obj.questionId; });
//                             arrUniqueQuestions = arrUniqueQuestions.filter(function (v, i) { return arrUniqueQuestions.indexOf(v) == i; });

//                             strTotalQuest = strTotalQuest + arrUniqueQuestions.length;

//                             for (let i = 0; i < arrUniqueQuestions.length; i++) {
//                                 let lstQuest = lstQuestions.filter(function (item) {
//                                     return item['questionId'] == arrUniqueQuestions[i]
//                                 });
//                                 let strTotal = 0;
//                                 for (let stuIndx = 0; stuIndx < arrStudents.length; stuIndx++) {
//                                     let lstStudent = lstStudents.filter(function (obj) {
//                                         return obj.regNo == arrStudents[stuIndx]
//                                     })

//                                     let lstAnswer = JSON.parse(lstStudent[0]['questAns']).filter(function (obj) {
//                                         return obj.questionId == arrUniqueQuestions[i]
//                                     })

//                                     if (lstAnswer.length > 0) {
//                                         let tmpAnswer = lstQuestions.filter(function (obj) {
//                                             return obj.answerId == lstAnswer[0]['answerId']
//                                         })
//                                         strTotal = strTotal + parseInt(tmpAnswer[0]['answer']);
//                                     }
//                                 }
//                                 // add questions
//                                 let questEval = strTotal / arrStudents.length;
//                                 strSubTotal = strSubTotal + strTotal;

//                                 arrQuestions.push({
//                                     "questionId": arrUniqueQuestions[i],
//                                     "question": lstQuest[0]['question'],
//                                     "questEvaluation": parseFloat(Number.isNaN(questEval) ? 0 : questEval).toFixed(2)
//                                 });
//                             }
//                         }

//                         let strOverallEval = strSubTotal / (strTotalQuest * arrStudents.length);
//                         lstResult.push({
//                             "academicYear": lstSubject[subIndx]['academicYear'],
//                             "staffDeptAcr": lstSubject[subIndx]['staffDeptAcr'],
//                             "staffDept": lstSubject[subIndx]['staffDept'],
//                             "staffTitle": lstSubject[subIndx]['staffTitle'],
//                             "staffName": lstSubject[subIndx]['staffName'],
//                             "staffDesig": lstSubject[subIndx]['staffDesig'],
//                             "encUrl": lstSubject[subIndx]['encUrl'],
//                             "subj_test_Id": lstSubject[subIndx]['semsubjId'],
//                             "stuDept": lstSubject[subIndx]['stuDept'],
//                             "stuBatch": lstSubject[subIndx]['stuBatch'],
//                             "stuSection": lstSubject[subIndx]['section'],
//                             "subCode": lstSubject[subIndx]['subCode'],
//                             "subName": lstSubject[subIndx]['subName'],
//                             "section": lstSubject[subIndx]['section'],
//                             "semester": lstSubject[subIndx]['semester'].padStart(2, '0'),
//                             "totalStudents": arrTotalStudents.length,
//                             "appearedStudents": arrStudents.length,
//                             "overallEval": parseFloat(Number.isNaN(strOverallEval) ? 0 : strOverallEval).toFixed(2),
//                             "questList": arrQuestions
//                         })
//                     }
//                 }
//             }
//         }
//     }
//     // To Sort by staffName 
//     lstResult.sort(function (a, b) {
//         if (a['staffName'].toString().toUpperCase() > b['staffName'].toString().toUpperCase()) {
//             return 1;
//         } else if (a['staffName'].toString().toUpperCase() < b['staffName'].toString().toUpperCase()) {
//             return -1;
//         }
//         return 0;
//     });
//     return lstResult;
// }

// module.exports.PrepareFeedbackPendingList = (pRows) => {
//     let lstSection = [];
//     if (pRows.length > 0) {

//         let arrCourseList = pRows.map(function (obj) { return { "courseAcr": obj.courseAcr, "courseDegree": obj.courseDegree, "courseObj": (obj.courseDegree + '-' + obj.courseAcr) }; });
//         arrCourseList = arrCourseList.filter((value, index, self) => self.map(x => x.courseObj).indexOf(value.courseObj) == index)
//         for (let courseIndex = 0; courseIndex < arrCourseList.length; courseIndex++) {

//             // get all course list
//             let arrCourse = pRows.filter(function (item1, pos1) {
//                 return item1.courseAcr == arrCourseList[courseIndex]['courseAcr'] && item1.courseDegree == arrCourseList[courseIndex]['courseDegree'];
//             });

//             // get unique batch list
//             let arrBatchList = arrCourse.map(item => item.batchYear).filter((value, index, self) => self.indexOf(value) === index)

//             for (let batchIndex = 0; batchIndex < arrBatchList.length; batchIndex++) {
//                 // get all batch list
//                 let arrBatch = arrCourse.filter(function (item1, pos1) {
//                     return item1.batchYear == arrBatchList[batchIndex];
//                 });

//                 let arrSectionList = arrBatch.map(item => item.section).filter((value, index, self) => self.indexOf(value) === index)

//                 for (let secIndex = 0; secIndex < arrSectionList.length; secIndex++) {

//                     // get all batch list
//                     let arrSection = arrBatch.filter(function (item1, pos1) {
//                         return item1.section == arrSectionList[secIndex];
//                     });

//                     // get feedback pending students
//                     let arrAnsweredStu = arrSection.filter(function (item1, pos1) {
//                         return item1.questAns != null
//                     });
//                     arrAnsweredStu = arrAnsweredStu.filter((value, index, self) => self.map(x => x.regNo).indexOf(value.regNo) == index)

//                     // get feedback pending students
//                     let arrPendingStu = arrSection.filter(function (item1, pos1) {
//                         return item1.questAns == null
//                     });

//                     // get student list
//                     let arrStudentList = arrPendingStu.map(item => { return { "regNo": item.regNo, "stuName": item.stuName, "stuMentor": item.stuMentor } });
//                     arrStudentList = arrStudentList.filter((value, index, self) => self.map(x => x.regNo).indexOf(value.regNo) == index)

//                     let arrPendingRegno = arrStudentList.map(item => { return item.regNo + "-" + item.stuName });

//                     arrSection = arrSection.filter((value, index, self) => self.map(x => x.regNo).indexOf(value.regNo) == index)

//                     lstSection.push({
//                         "courseDegree": arrCourseList[courseIndex]['courseDegree'],
//                         "courseAcr": arrCourseList[courseIndex]['courseAcr'],
//                         "batch": arrBatchList[batchIndex],
//                         "section": arrSectionList[secIndex],
//                         "totalStu": arrSection.length,
//                         "appearedStu": arrAnsweredStu.length,
//                         "pendingStu": arrStudentList.length,
//                         "stuList": arrStudentList
//                     });
//                 }
//             }
//         }
//     }
//     return lstSection;
// }

// module.exports.PrepareStaffEvaluationReport = (pRows) => {
//     let lstResult = [];
//     if (pRows[0].length > 0) {

//         let arrStaffList = pRows[0].map(function (obj) { return obj });
//         arrStaffList = arrStaffList.filter((value, index, self) => self.map(x => x.staffCode).indexOf(value.staffCode) == index)

//         for (let staffIndx = 0; staffIndx < arrStaffList.length; staffIndx++) {
//             let arrStaff = pRows[0].filter(function (obj) {
//                 return obj.staffCode == arrStaffList[staffIndx]['staffCode']
//             })

//             let arrFeedbackCategory = arrStaff.map(function (obj) { return obj });
//             arrFeedbackCategory = arrFeedbackCategory.filter((value, index, self) => self.map(x => x.catName).indexOf(value.catName) == index).sort();

//             let objFeedbackCategory = {};
//             for (let catIndx = 0; catIndx < arrFeedbackCategory.length; catIndx++) {
//                 let arrCategory = arrStaff.filter(function (obj) {
//                     return obj.catName == arrFeedbackCategory[catIndx]['catName']
//                 })

//                 let lstStaffSubjects = [];
//                 let arrCourseList = arrCategory.map(function (obj) { return obj.stuCourseId });
//                 arrCourseList = arrCourseList.filter((value, index, self) => self.map(x => x.stuCourseId).indexOf(value.stuCourseId) == index)
//                 for (let courseIndex = 0; courseIndex < arrCourseList.length; courseIndex++) {

//                     // get all course list
//                     let arrCourse = arrCategory.filter(function (item1, pos1) {
//                         return item1.stuCourseId == arrCourseList[courseIndex];
//                     });

//                     // get unique batch list
//                     let arrBatchList = arrCourse.map(item => item.stuBatchId).filter((value, index, self) => self.indexOf(value) === index)

//                     for (let batchIndex = 0; batchIndex < arrBatchList.length; batchIndex++) {
//                         // get all batch list
//                         let arrBatch = arrCourse.filter(function (item1, pos1) {
//                             return item1.stuBatchId == arrBatchList[batchIndex];
//                         });

//                         let arrSectionList = arrBatch.map(item => item.section).filter((value, index, self) => self.indexOf(value) === index)

//                         for (let secIndex = 0; secIndex < arrSectionList.length; secIndex++) {

//                             // get all batch list
//                             let arrSection = arrBatch.filter(function (item1, pos1) {
//                                 return item1.section == arrSectionList[secIndex];
//                             });

//                             // To get total students
//                             let arrTotalStudents = arrSection.map(function (obj) { return obj.regNo; });
//                             arrTotalStudents = arrTotalStudents.filter(function (v, i) { return arrTotalStudents.indexOf(v) == i; });

//                             let lstSubject = arrSection.map(function (obj) { return obj; });
//                             lstSubject = lstSubject.filter((value, index, self) => self.map(x => x.subCode).indexOf(value.subCode) == index)

//                             for (let subIndx = 0; subIndx < lstSubject.length; subIndx++) {
//                                 let lstStudents = arrSection.filter(function (obj) {
//                                     return obj.subCode == lstSubject[subIndx]['subCode']
//                                 })

//                                 // to get total students who are answered the feedback
//                                 let arrTempStudents = lstStudents.filter(function (obj) {
//                                     return obj['questAns'] != null
//                                 })
//                                 let arrStudents = arrTempStudents.map(function (obj) { return obj.regNo; });
//                                 arrStudents = arrStudents.filter((value, index, self) => self.map(x => x).indexOf(value) == index)

//                                 let strSubTotal = 0, strTotalQuest = 0, arrQuestions = [];

//                                 let arrQuestionGrp = pRows[1].map(function (obj) { return obj.questGroup; });
//                                 arrQuestionGrp = arrQuestionGrp.filter(function (v, i) { return arrQuestionGrp.indexOf(v) == i; });

//                                 for (let k = 0; k < arrQuestionGrp.length; k++) {
//                                     let lstQuestions = pRows[1].filter(function (obj) {
//                                         return obj['questGroup'] == arrQuestionGrp[k]
//                                     });

//                                     let arrUniqueQuestions = lstQuestions.map(function (obj) { return obj.questionId; });
//                                     arrUniqueQuestions = arrUniqueQuestions.filter(function (v, i) { return arrUniqueQuestions.indexOf(v) == i; });

//                                     strTotalQuest = strTotalQuest + arrUniqueQuestions.length;

//                                     for (let i = 0; i < arrUniqueQuestions.length; i++) {
//                                         let lstQuest = lstQuestions.filter(function (item) {
//                                             return item['questionId'] == arrUniqueQuestions[i]
//                                         });
//                                         let strTotal = 0;
//                                         for (let stuIndx = 0; stuIndx < arrStudents.length; stuIndx++) {
//                                             let lstStudent = lstStudents.filter(function (obj) {
//                                                 return obj.regNo == arrStudents[stuIndx]
//                                             })

//                                             let lstAnswer = JSON.parse(lstStudent[0]['questAns']).filter(function (obj) {
//                                                 return obj.questionId == arrUniqueQuestions[i]
//                                             })

//                                             if (lstAnswer.length > 0) {
//                                                 let tmpAnswer = lstQuestions.filter(function (obj) {
//                                                     return obj.answerId == lstAnswer[0]['answerId']
//                                                 })
//                                                 strTotal = strTotal + parseInt(tmpAnswer[0]['answer']);
//                                             }
//                                         }
//                                         // add total of students answer
//                                         strSubTotal = strSubTotal + strTotal;
//                                     }
//                                 }

//                                 let strOverallEval = strSubTotal / (strTotalQuest * arrStudents.length);
//                                 lstStaffSubjects.push({
//                                     "subj_test_Id": lstSubject[subIndx]['semsubjId'],
//                                     "stuDept": lstSubject[subIndx]['stuDept'],
//                                     "stuBatch": lstSubject[subIndx]['stuBatch'],
//                                     "stuSection": lstSubject[subIndx]['section'],
//                                     "subCode": lstSubject[subIndx]['subCode'],
//                                     "subName": lstSubject[subIndx]['subName'],
//                                     "section": lstSubject[subIndx]['section'],
//                                     "semester": lstSubject[subIndx]['semester'].padStart(2, '0'),
//                                     "totalStudents": arrTotalStudents.length,
//                                     "appearedStudents": arrStudents.length,
//                                     "overallEval": parseFloat(Number.isNaN(strOverallEval) ? 0 : strOverallEval).toFixed(2)
//                                 })
//                             }
//                         }
//                     }
//                 }
//                 let strCatName = arrCategory[0]['catName'];
//                 objFeedbackCategory[strCatName] = lstStaffSubjects
//             }
//             let objStaff = {
//                 "staffDeptAcr": arrStaff[0]['staffDeptAcr'],
//                 "staffDept": arrStaff[0]['staffDept'],
//                 "staffTitle": arrStaff[0]['staffTitle'],
//                 "staffName": arrStaff[0]['staffName'],
//                 "staffDesig": arrStaff[0]['staffDesig'],
//                 "encUrl": arrStaff[0]['encUrl']
//             }
//             lstResult.push({ ...objStaff, ...objFeedbackCategory });
//         }
//     }
//     // To Sort by staffName 
//     lstResult.sort(function (a, b) {
//         if (a['staffName'].toString().toUpperCase() > b['staffName'].toString().toUpperCase()) {
//             return 1;
//         } else if (a['staffName'].toString().toUpperCase() < b['staffName'].toString().toUpperCase()) {
//             return -1;
//         }
//         return 0;
//     });

//     return lstResult;
// }

// module.exports.PrepareFeedbackSubjectList = (pRows) => {
//     let lstSubject = [];
//     if (pRows[0].length > 0) {
//         let arrSubjects = pRows[0].map(function (obj) { return obj.subCode; });
//         arrSubjects = arrSubjects.filter(function (v, i) { return arrSubjects.indexOf(v) == i; });

//         for (let subIndx = 0; subIndx < arrSubjects.length; subIndx++) {

//             let arrSubject = pRows[0].filter(function (obj) {
//                 return obj.subCode == arrSubjects[subIndx]
//             });

//             let arrQuestionGrp = pRows[1].map(function (obj) { return obj.questGroup; });
//             arrQuestionGrp = arrQuestionGrp.filter(function (v, i) { return arrQuestionGrp.indexOf(v) == i; });
//             let lstQuestGroup = [];
//             for (let k = 0; k < arrQuestionGrp.length; k++) {
//                 let lstQuestions = pRows[1].filter(function (obj) {
//                     return obj['questGroup'] == arrQuestionGrp[k]
//                 });
//                 let strFeedbackCategory = lstQuestions[0]['feedbackCategory'];
//                 let arrUniqueQuestions = lstQuestions.map(function (obj) { return obj.questionId; });
//                 arrUniqueQuestions = arrUniqueQuestions.filter(function (v, i) { return arrUniqueQuestions.indexOf(v) == i; });
//                 let arrQuest = [];

//                 for (let i = 0; i < arrUniqueQuestions.length; i++) {
//                     let lstQuest = lstQuestions.filter(function (item) {
//                         return item['questionId'] == arrUniqueQuestions[i]
//                     });

//                     let lstAnswer = JSON.parse(arrSubject[0]['questAns']).filter(function (obj) {
//                         return obj.questionId == arrUniqueQuestions[i]
//                     })
//                     let strAnswerId = null; // if answered the question, set answer id
//                     if (lstAnswer.length > 0)
//                         strAnswerId = lstAnswer[0]['answerId'];

//                     let arrAnswer = lstQuest.map(function (obj) { return { "answerId": obj.answerId, "answer": obj.answer }; });
//                     arrQuest.push({
//                         "questionId": lstQuest[0]['questionId'], "question": lstQuest[0]['question'], "value": strAnswerId, "answerList": arrAnswer
//                     })
//                 }
//                 lstQuestGroup.push({
//                     "grpName": arrQuestionGrp[k], "feedbackCategory": strFeedbackCategory, "questions": arrQuest
//                 })
//             }

//             lstSubject.push({
//                 "deptAcr": arrSubject[0]['deptAcr'],
//                 "deptName": arrSubject[0]['deptName'],
//                 "encUrl": arrSubject[0]['encUrl'],
//                 "subj_test_Id": arrSubject[0]['semsubjId'],
//                 "staffDesig": arrSubject[0]['staffDesig'],
//                 "staffName": arrSubject[0]['staffName'],
//                 "staffTitle": arrSubject[0]['staffTitle'],
//                 "subCode": arrSubject[0]['subCode'],
//                 "subName": arrSubject[0]['subName'],
//                 "questGrp": lstQuestGroup
//             })
//         }
//     }
//     return lstSubject;
// }

// module.exports.PrepareEvaluationReportBySubwise = (pRows) => {
//     let lstSubject = [];
//     if (pRows[0].length > 0) {
//         // To get total students
//         let arrTotalStudents = pRows[0].map(function (obj) { return obj.regNo; });
//         arrTotalStudents = arrTotalStudents.filter(function (v, i) { return arrTotalStudents.indexOf(v) == i; });

//         // to get total students who are answered the feedback
//         let arrTempStudents = pRows[0].filter(function (obj) {
//             return obj['questAns'] != null
//         })
//         let arrStudents = arrTempStudents.map(function (obj) { return obj.regNo; });
//         arrStudents = arrStudents.filter((value, index, self) => self.map(x => x).indexOf(value) == index)

//         let strTotalQuest = 0;

//         let arrQuestionGrp = pRows[1].map(function (obj) { return obj.questGroup; });
//         arrQuestionGrp = arrQuestionGrp.filter(function (v, i) { return arrQuestionGrp.indexOf(v) == i; });
//         let lstQuestGroup = [];
//         let strQrpTotal = 0;
//         for (let k = 0; k < arrQuestionGrp.length; k++) {
//             let lstQuestions = pRows[1].filter(function (obj) {
//                 return obj['questGroup'] == arrQuestionGrp[k]
//             });

//             let arrUniqueQuestions = lstQuestions.map(function (obj) { return obj.questionId; });
//             arrUniqueQuestions = arrUniqueQuestions.filter(function (v, i) { return arrUniqueQuestions.indexOf(v) == i; });
//             let arrQuest = [];
//             let strQuestTotal = 0;
//             strTotalQuest = arrUniqueQuestions.length;

//             for (let i = 0; i < arrUniqueQuestions.length; i++) {
//                 let lstQuest = lstQuestions.filter(function (item) {
//                     return item['questionId'] == arrUniqueQuestions[i]
//                 });

//                 let strTotal = 0;
//                 for (let stuIndx = 0; stuIndx < arrStudents.length; stuIndx++) {
//                     let lstStudent = pRows[0].filter(function (obj) {
//                         return obj.regNo == arrStudents[stuIndx]
//                     })

//                     let lstAnswer = JSON.parse(lstStudent[0]['questAns']).filter(function (obj) {
//                         return obj.questionId == arrUniqueQuestions[i]
//                     })

//                     if (lstAnswer.length > 0) {
//                         let tmpAnswer = lstQuestions.filter(function (obj) {
//                             return obj.answerId == lstAnswer[0]['answerId']
//                         })
//                         strTotal = strTotal + parseInt(tmpAnswer[0]['answer'])
//                     }
//                 }
//                 arrQuest.push({
//                     "questionId": lstQuest[0]['questionId'], "question": lstQuest[0]['question'],
//                     "questEvaluation": parseFloat(Number.isNaN(strTotal / arrStudents.length) ? 0 : (strTotal / arrStudents.length)).toFixed(2)
//                 })
//                 strQuestTotal = strQuestTotal + strTotal;
//             }
//             let strGrpEval = strQuestTotal / (arrUniqueQuestions.length * arrStudents.length);
//             lstQuestGroup.push({
//                 "grpName": arrQuestionGrp[k],
//                 "grpEval": parseFloat(Number.isNaN(strGrpEval) ? 0 : strGrpEval).toFixed(2),
//                 "questions": arrQuest
//             })
//             strQrpTotal = strQrpTotal + strQuestTotal;
//         }

//         let strOverallEval = strQrpTotal / (strTotalQuest * arrStudents.length);

//         // let hodSignatureUrl = '';
//         // if (pRows[2].length > 0)
//         //     hodSignatureUrl = pRows[2][0]['hodSignature'];

//         lstSubject.push({
//             "academicYear": pRows[0][0]['academicYear'],
//             "staffDeptAcr": pRows[0][0]['staffDeptAcr'],
//             "staffDept": pRows[0][0]['staffDept'],
//             "staffTitle": pRows[0][0]['staffTitle'],
//             "staffName": pRows[0][0]['staffName'],
//             "staffDesig": pRows[0][0]['staffDesig'],
//             "encUrl": pRows[0][0]['encUrl'],
//             // "hodSignatureUrl": hodSignatureUrl,
//             "subj_test_Id": pRows[0][0]['semsubjId'],
//             "stuDept": pRows[0][0]['stuDept'],
//             "stuBatch": pRows[0][0]['stuBatch'],
//             "stuSection": pRows[0][0]['section'],
//             "subCode": pRows[0][0]['subCode'],
//             "subName": pRows[0][0]['subName'],
//             "section": pRows[0][0]['section'],
//             "semester": pRows[0][0]['semester'].padStart(2, '0'),
//             "totalStudents": arrTotalStudents.length,
//             "appearedStudents": arrStudents.length,
//             "overallEval": parseFloat(Number.isNaN(strOverallEval) ? 0 : strOverallEval).toFixed(2),
//             "questGrp": lstQuestGroup
//         })
//     }

//     return lstSubject;
// }

// module.exports.PrepareEvaluationReportByClasswise = (pRows) => {
//     let objResult = {};
//     if (pRows[0].length > 0) {

//         // to get overall students 
//         let arrTotalStudents = pRows[0].map(function (obj) { return obj.regNo; });
//         arrTotalStudents = arrTotalStudents.filter(function (v, i) { return arrTotalStudents.indexOf(v) == i; });

//         let arrSubjects = pRows[0].map(function (obj) { return obj.subCode; });
//         arrSubjects = arrSubjects.filter(function (v, i) { return arrSubjects.indexOf(v) == i; });

//         let arrUniqueQuestions = pRows[1].map(function (obj) { return obj.questionId; });
//         arrUniqueQuestions = arrUniqueQuestions.filter(function (v, i) { return arrUniqueQuestions.indexOf(v) == i; });

//         let strTotalQuest = arrUniqueQuestions.length;
//         let lstSubjects = [], strFinalTotal = 0, strFinalStudents = 0;

//         for (let subIndx = 0; subIndx < arrSubjects.length; subIndx++) {

//             let lstSubject = pRows[0].filter(function (item) {
//                 return item['subCode'] == arrSubjects[subIndx]
//             });

//             // to get total students who are answered the feedback
//             let arrTempStudents = lstSubject.filter(function (obj) {
//                 return obj['questAns'] != null
//             })
//             let arrStudents = arrTempStudents.map(function (obj) { return obj.regNo; });
//             arrStudents = arrStudents.filter((value, index, self) => self.map(x => x).indexOf(value) == index)

//             let strSubTotal = 0;

//             for (let stuIndx = 0; stuIndx < arrStudents.length; stuIndx++) {
//                 let lstStudent = lstSubject.filter(function (obj) {
//                     return obj.regNo == arrStudents[stuIndx]
//                 })

//                 let arrStuQuestAns = JSON.parse(lstStudent[0]['questAns']);
//                 for (let i = 0; i < arrUniqueQuestions.length; i++) {

//                     let lstAnswer = arrStuQuestAns.filter(function (obj) {
//                         return obj.questionId == arrUniqueQuestions[i];
//                     })

//                     if (lstAnswer.length > 0) {
//                         let tmpAnswer = pRows[1].filter(function (obj) {
//                             return obj.questionId == arrUniqueQuestions[i] && obj.answerId == lstAnswer[0]['answerId'];
//                         })
//                         strSubTotal = strSubTotal + parseInt(tmpAnswer[0]['answer']);
//                     }
//                 }
//             }

//             let strSubEvaluation = strSubTotal / (strTotalQuest * arrStudents.length);
//             lstSubjects.push({
//                 "subCode": lstSubject[0]['subCode'],
//                 "subName": lstSubject[0]['subName'],
//                 "subj_test_Id": lstSubject[0]['semsubjId'],
//                 "staffTitle": lstSubject[0]['staffTitle'],
//                 "staffName": lstSubject[0]['staffName'],
//                 "staffDesig": lstSubject[0]['staffDesig'],
//                 "encUrl": lstSubject[0]['encUrl'],
//                 "subEvaluation": parseFloat(Number.isNaN(strSubEvaluation) ? 0 : strSubEvaluation).toFixed(2)
//             })
//             strFinalTotal = strFinalTotal + strSubTotal;
//             strFinalStudents = strFinalStudents + arrStudents.length;
//         }
//         let strClassEvaluation = strFinalTotal / (strTotalQuest * strFinalStudents * arrSubjects.length);
//         objResult = {
//             "academicYear": pRows[0][0]['academicYear'],
//             "deptAcr": pRows[0][0]['deptAcr'],
//             "deptName": pRows[0][0]['deptName'],
//             "courseAcr": pRows[0][0]['courseAcr'],
//             "courseDegree": pRows[0][0]['courseDegree'],
//             "batchYear": pRows[0][0]['batchYear'],
//             "section": pRows[0][0]['section'],
//             "semester": pRows[0][0]['semester'].padStart(2, '0'),
//             "totalStudents": arrTotalStudents.length,
//             // "appearedStudents": strFinalStudents,
//             // "overallEval": parseFloat(Number.isNaN(strClassEvaluation) ? 0 : strClassEvaluation).toFixed(2),
//             "subList": lstSubjects
//         }
//     }
//     return objResult;
// }

// module.exports.PrepareEvaluationReportByDeptwise = (pRows) => {
//     let lstResult = [];
//     if (pRows[0].length > 0) {

//         let arrCourseList = pRows[0].map(function (obj) { return obj.stuCourseId });
//         arrCourseList = arrCourseList.filter((value, index, self) => self.map(x => x.stuCourseId).indexOf(value.stuCourseId) == index)
//         for (let courseIndex = 0; courseIndex < arrCourseList.length; courseIndex++) {

//             // get all course list
//             let arrCourse = pRows[0].filter(function (item1, pos1) {
//                 return item1.stuCourseId == arrCourseList[courseIndex];
//             });

//             // get unique batch list
//             let arrBatchList = arrCourse.map(item => item.stuBatchId).filter((value, index, self) => self.indexOf(value) === index)

//             for (let batchIndex = 0; batchIndex < arrBatchList.length; batchIndex++) {
//                 // get all batch list
//                 let arrBatch = arrCourse.filter(function (item1, pos1) {
//                     return item1.stuBatchId == arrBatchList[batchIndex];
//                 });

//                 let arrSectionList = arrBatch.map(item => item.section).filter((value, index, self) => self.indexOf(value) === index)

//                 for (let secIndex = 0; secIndex < arrSectionList.length; secIndex++) {

//                     // get all batch list
//                     let arrSection = arrBatch.filter(function (item1, pos1) {
//                         return item1.section == arrSectionList[secIndex];
//                     });

//                     // To get total students
//                     let arrTotalStudents = arrSection.map(function (obj) { return obj.regNo; });
//                     arrTotalStudents = arrTotalStudents.filter(function (v, i) { return arrTotalStudents.indexOf(v) == i; });

//                     let lstSubject = arrSection.map(function (obj) { return obj; });
//                     lstSubject = lstSubject.filter((value, index, self) => self.map(x => x.subCode).indexOf(value.subCode) == index)

//                     for (let subIndx = 0; subIndx < lstSubject.length; subIndx++) {
//                         let lstStudents = arrSection.filter(function (obj) {
//                             return obj.subCode == lstSubject[subIndx]['subCode']
//                         })

//                         // to get total students who are answered the feedback
//                         let arrTempStudents = lstStudents.filter(function (obj) {
//                             return obj['questAns'] != null
//                         })
//                         let arrStudents = arrTempStudents.map(function (obj) { return obj.regNo; });
//                         arrStudents = arrStudents.filter((value, index, self) => self.map(x => x).indexOf(value) == index)

//                         let strSubTotal = 0, strTotalQuest = 0, arrQuestions = [];

//                         let arrQuestionGrp = pRows[1].map(function (obj) { return obj.questGroup; });
//                         arrQuestionGrp = arrQuestionGrp.filter(function (v, i) { return arrQuestionGrp.indexOf(v) == i; });

//                         for (let k = 0; k < arrQuestionGrp.length; k++) {
//                             let lstQuestions = pRows[1].filter(function (obj) {
//                                 return obj['questGroup'] == arrQuestionGrp[k]
//                             });

//                             let arrUniqueQuestions = lstQuestions.map(function (obj) { return obj.questionId; });
//                             arrUniqueQuestions = arrUniqueQuestions.filter(function (v, i) { return arrUniqueQuestions.indexOf(v) == i; });

//                             strTotalQuest = strTotalQuest + arrUniqueQuestions.length;

//                             for (let i = 0; i < arrUniqueQuestions.length; i++) {
//                                 let lstQuest = lstQuestions.filter(function (item) {
//                                     return item['questionId'] == arrUniqueQuestions[i]
//                                 });
//                                 let strTotal = 0;
//                                 for (let stuIndx = 0; stuIndx < arrStudents.length; stuIndx++) {
//                                     let lstStudent = lstStudents.filter(function (obj) {
//                                         return obj.regNo == arrStudents[stuIndx]
//                                     })

//                                     let lstAnswer = JSON.parse(lstStudent[0]['questAns']).filter(function (obj) {
//                                         return obj.questionId == arrUniqueQuestions[i]
//                                     })

//                                     if (lstAnswer.length > 0) {
//                                         let tmpAnswer = lstQuestions.filter(function (obj) {
//                                             return obj.answerId == lstAnswer[0]['answerId']
//                                         })
//                                         strTotal = strTotal + parseInt(tmpAnswer[0]['answer']);
//                                     }
//                                 }
//                                 // add questions
//                                 let questEval = strTotal / arrStudents.length;
//                                 strSubTotal = strSubTotal + strTotal;

//                                 arrQuestions.push({
//                                     "questionId": arrUniqueQuestions[i],
//                                     "question": lstQuest[0]['question'],
//                                     "questEvaluation": parseFloat(Number.isNaN(questEval) ? 0 : questEval).toFixed(2)
//                                 });
//                             }
//                         }

//                         let strOverallEval = strSubTotal / (strTotalQuest * arrStudents.length);
//                         lstResult.push({
//                             "academicYear": lstSubject[subIndx]['academicYear'],
//                             "staffDeptAcr": lstSubject[subIndx]['staffDeptAcr'],
//                             "staffDept": lstSubject[subIndx]['staffDept'],
//                             "staffTitle": lstSubject[subIndx]['staffTitle'],
//                             "staffName": lstSubject[subIndx]['staffName'],
//                             "staffDesig": lstSubject[subIndx]['staffDesig'],
//                             "encUrl": lstSubject[subIndx]['encUrl'],
//                             "subj_test_Id": lstSubject[subIndx]['semsubjId'],
//                             "stuDept": lstSubject[subIndx]['stuDept'],
//                             "stuBatch": lstSubject[subIndx]['stuBatch'],
//                             "stuSection": lstSubject[subIndx]['section'],
//                             "subCode": lstSubject[subIndx]['subCode'],
//                             "subName": lstSubject[subIndx]['subName'],
//                             "section": lstSubject[subIndx]['section'],
//                             "semester": lstSubject[subIndx]['semester'].padStart(2, '0'),
//                             "totalStudents": arrTotalStudents.length,
//                             "appearedStudents": arrStudents.length,
//                             "overallEval": parseFloat(Number.isNaN(strOverallEval) ? 0 : strOverallEval).toFixed(2),
//                             "questList": arrQuestions
//                         })
//                     }
//                 }
//             }
//         }
//     }
//     // To Sort by staffName 
//     lstResult.sort(function (a, b) {
//         if (a['staffName'].toString().toUpperCase() > b['staffName'].toString().toUpperCase()) {
//             return 1;
//         } else if (a['staffName'].toString().toUpperCase() < b['staffName'].toString().toUpperCase()) {
//             return -1;
//         }
//         return 0;
//     });
//     return lstResult;
// }

// module.exports.PrepareFeedbackPendingList = (pRows) => {
//     let lstSection = [];
//     if (pRows.length > 0) {

//         let arrCourseList = pRows.map(function (obj) { return { "courseAcr": obj.courseAcr, "courseDegree": obj.courseDegree, "courseObj": (obj.courseDegree + '-' + obj.courseAcr) }; });
//         arrCourseList = arrCourseList.filter((value, index, self) => self.map(x => x.courseObj).indexOf(value.courseObj) == index)
//         for (let courseIndex = 0; courseIndex < arrCourseList.length; courseIndex++) {

//             // get all course list
//             let arrCourse = pRows.filter(function (item1, pos1) {
//                 return item1.courseAcr == arrCourseList[courseIndex]['courseAcr'] && item1.courseDegree == arrCourseList[courseIndex]['courseDegree'];
//             });

//             // get unique batch list
//             let arrBatchList = arrCourse.map(item => item.batchYear).filter((value, index, self) => self.indexOf(value) === index)

//             for (let batchIndex = 0; batchIndex < arrBatchList.length; batchIndex++) {
//                 // get all batch list
//                 let arrBatch = arrCourse.filter(function (item1, pos1) {
//                     return item1.batchYear == arrBatchList[batchIndex];
//                 });

//                 let arrSectionList = arrBatch.map(item => item.section).filter((value, index, self) => self.indexOf(value) === index)

//                 for (let secIndex = 0; secIndex < arrSectionList.length; secIndex++) {

//                     // get all batch list
//                     let arrSection = arrBatch.filter(function (item1, pos1) {
//                         return item1.section == arrSectionList[secIndex];
//                     });

//                     // get feedback pending students
//                     let arrAnsweredStu = arrSection.filter(function (item1, pos1) {
//                         return item1.questAns != null
//                     });
//                     arrAnsweredStu = arrAnsweredStu.filter((value, index, self) => self.map(x => x.regNo).indexOf(value.regNo) == index)

//                     // get feedback pending students
//                     let arrPendingStu = arrSection.filter(function (item1, pos1) {
//                         return item1.questAns == null
//                     });

//                     // get student list
//                     let arrStudentList = arrPendingStu.map(item => { return { "regNo": item.regNo, "stuName": item.stuName, "stuMentor": item.stuMentor } });
//                     arrStudentList = arrStudentList.filter((value, index, self) => self.map(x => x.regNo).indexOf(value.regNo) == index)

//                     let arrPendingRegno = arrStudentList.map(item => { return item.regNo + "-" + item.stuName });

//                     arrSection = arrSection.filter((value, index, self) => self.map(x => x.regNo).indexOf(value.regNo) == index)

//                     lstSection.push({
//                         "courseDegree": arrCourseList[courseIndex]['courseDegree'],
//                         "courseAcr": arrCourseList[courseIndex]['courseAcr'],
//                         "batch": arrBatchList[batchIndex],
//                         "section": arrSectionList[secIndex],
//                         "totalStu": arrSection.length,
//                         "appearedStu": arrAnsweredStu.length,
//                         "pendingStu": arrStudentList.length,
//                         "stuList": arrStudentList
//                     });
//                 }
//             }
//         }
//     }
//     return lstSection;
// }

// module.exports.PrepareStaffEvaluationReport = (pRows) => {
//     let lstResult = [];
//     if (pRows[0].length > 0) {

//         let arrStaffList = pRows[0].map(function (obj) { return obj });
//         arrStaffList = arrStaffList.filter((value, index, self) => self.map(x => x.staffCode).indexOf(value.staffCode) == index)

//         for (let staffIndx = 0; staffIndx < arrStaffList.length; staffIndx++) {
//             let arrStaff = pRows[0].filter(function (obj) {
//                 return obj.staffCode == arrStaffList[staffIndx]['staffCode']
//             })

//             let arrFeedbackCategory = arrStaff.map(function (obj) { return obj });
//             arrFeedbackCategory = arrFeedbackCategory.filter((value, index, self) => self.map(x => x.catName).indexOf(value.catName) == index).sort();

//             let objFeedbackCategory = {};
//             for (let catIndx = 0; catIndx < arrFeedbackCategory.length; catIndx++) {
//                 let arrCategory = arrStaff.filter(function (obj) {
//                     return obj.catName == arrFeedbackCategory[catIndx]['catName']
//                 })

//                 let lstStaffSubjects = [];
//                 let arrCourseList = arrCategory.map(function (obj) { return obj.stuCourseId });
//                 arrCourseList = arrCourseList.filter((value, index, self) => self.map(x => x.stuCourseId).indexOf(value.stuCourseId) == index)
//                 for (let courseIndex = 0; courseIndex < arrCourseList.length; courseIndex++) {

//                     // get all course list
//                     let arrCourse = arrCategory.filter(function (item1, pos1) {
//                         return item1.stuCourseId == arrCourseList[courseIndex];
//                     });

//                     // get unique batch list
//                     let arrBatchList = arrCourse.map(item => item.stuBatchId).filter((value, index, self) => self.indexOf(value) === index)

//                     for (let batchIndex = 0; batchIndex < arrBatchList.length; batchIndex++) {
//                         // get all batch list
//                         let arrBatch = arrCourse.filter(function (item1, pos1) {
//                             return item1.stuBatchId == arrBatchList[batchIndex];
//                         });

//                         let arrSectionList = arrBatch.map(item => item.section).filter((value, index, self) => self.indexOf(value) === index)

//                         for (let secIndex = 0; secIndex < arrSectionList.length; secIndex++) {

//                             // get all batch list
//                             let arrSection = arrBatch.filter(function (item1, pos1) {
//                                 return item1.section == arrSectionList[secIndex];
//                             });

//                             // To get total students
//                             let arrTotalStudents = arrSection.map(function (obj) { return obj.regNo; });
//                             arrTotalStudents = arrTotalStudents.filter(function (v, i) { return arrTotalStudents.indexOf(v) == i; });

//                             let lstSubject = arrSection.map(function (obj) { return obj; });
//                             lstSubject = lstSubject.filter((value, index, self) => self.map(x => x.subCode).indexOf(value.subCode) == index)

//                             for (let subIndx = 0; subIndx < lstSubject.length; subIndx++) {
//                                 let lstStudents = arrSection.filter(function (obj) {
//                                     return obj.subCode == lstSubject[subIndx]['subCode']
//                                 })

//                                 // to get total students who are answered the feedback
//                                 let arrTempStudents = lstStudents.filter(function (obj) {
//                                     return obj['questAns'] != null
//                                 })
//                                 let arrStudents = arrTempStudents.map(function (obj) { return obj.regNo; });
//                                 arrStudents = arrStudents.filter((value, index, self) => self.map(x => x).indexOf(value) == index)

//                                 let strSubTotal = 0, strTotalQuest = 0, arrQuestions = [];

//                                 let arrQuestionGrp = pRows[1].map(function (obj) { return obj.questGroup; });
//                                 arrQuestionGrp = arrQuestionGrp.filter(function (v, i) { return arrQuestionGrp.indexOf(v) == i; });

//                                 for (let k = 0; k < arrQuestionGrp.length; k++) {
//                                     let lstQuestions = pRows[1].filter(function (obj) {
//                                         return obj['questGroup'] == arrQuestionGrp[k]
//                                     });

//                                     let arrUniqueQuestions = lstQuestions.map(function (obj) { return obj.questionId; });
//                                     arrUniqueQuestions = arrUniqueQuestions.filter(function (v, i) { return arrUniqueQuestions.indexOf(v) == i; });

//                                     strTotalQuest = strTotalQuest + arrUniqueQuestions.length;

//                                     for (let i = 0; i < arrUniqueQuestions.length; i++) {
//                                         let lstQuest = lstQuestions.filter(function (item) {
//                                             return item['questionId'] == arrUniqueQuestions[i]
//                                         });
//                                         let strTotal = 0;
//                                         for (let stuIndx = 0; stuIndx < arrStudents.length; stuIndx++) {
//                                             let lstStudent = lstStudents.filter(function (obj) {
//                                                 return obj.regNo == arrStudents[stuIndx]
//                                             })

//                                             let lstAnswer = JSON.parse(lstStudent[0]['questAns']).filter(function (obj) {
//                                                 return obj.questionId == arrUniqueQuestions[i]
//                                             })

//                                             if (lstAnswer.length > 0) {
//                                                 let tmpAnswer = lstQuestions.filter(function (obj) {
//                                                     return obj.answerId == lstAnswer[0]['answerId']
//                                                 })
//                                                 strTotal = strTotal + parseInt(tmpAnswer[0]['answer']);
//                                             }
//                                         }
//                                         // add total of students answer
//                                         strSubTotal = strSubTotal + strTotal;
//                                     }
//                                 }

//                                 let strOverallEval = strSubTotal / (strTotalQuest * arrStudents.length);
//                                 lstStaffSubjects.push({
//                                     "subj_test_Id": lstSubject[subIndx]['semsubjId'],
//                                     "stuDept": lstSubject[subIndx]['stuDept'],
//                                     "stuBatch": lstSubject[subIndx]['stuBatch'],
//                                     "stuSection": lstSubject[subIndx]['section'],
//                                     "subCode": lstSubject[subIndx]['subCode'],
//                                     "subName": lstSubject[subIndx]['subName'],
//                                     "section": lstSubject[subIndx]['section'],
//                                     "semester": lstSubject[subIndx]['semester'].padStart(2, '0'),
//                                     "totalStudents": arrTotalStudents.length,
//                                     "appearedStudents": arrStudents.length,
//                                     "overallEval": parseFloat(Number.isNaN(strOverallEval) ? 0 : strOverallEval).toFixed(2)
//                                 })
//                             }
//                         }
//                     }
//                 }
//                 let strCatName = arrCategory[0]['catName'];
//                 objFeedbackCategory[strCatName] = lstStaffSubjects
//             }
//             let objStaff = {
//                 "staffDeptAcr": arrStaff[0]['staffDeptAcr'],
//                 "staffDept": arrStaff[0]['staffDept'],
//                 "staffTitle": arrStaff[0]['staffTitle'],
//                 "staffName": arrStaff[0]['staffName'],
//                 "staffDesig": arrStaff[0]['staffDesig'],
//                 "encUrl": arrStaff[0]['encUrl']
//             }
//             lstResult.push({ ...objStaff, ...objFeedbackCategory });
//         }
//     }
//     // To Sort by staffName 
//     lstResult.sort(function (a, b) {
//         if (a['staffName'].toString().toUpperCase() > b['staffName'].toString().toUpperCase()) {
//             return 1;
//         } else if (a['staffName'].toString().toUpperCase() < b['staffName'].toString().toUpperCase()) {
//             return -1;
//         }
//         return 0;
//     });

//     return lstResult;
// }

/***************************** COE service***************************/


module.exports.HallPlanning = (rows, callback) => {

}

module.exports.PrepareHallTicketPreviewForm = (pRows) => {
    let lstStudents = [];
    let strRegulation = '';
    var lstRegno = pRows[2].map(function (obj) { return obj.registerNo; });
    lstRegno = lstRegno.filter(function (v, i) { return lstRegno.indexOf(v) == i; });

    for (let indx = 0; indx < lstRegno.length; indx++) {
        let arrStudents = pRows[2].filter(function (stu) {
            return stu['registerNo'] == lstRegno[indx]
        })

        // To find maximum semester of student
        let maxSemester = arrStudents.reduce(function (prev, current) {
            return (prev.semester > current.semester) ? prev : current
        });

        let arrSubjects = [];
        let strTotalAmt = 0;
        let strTotalSub = 0;

        for (let stuIndx = 0; stuIndx < arrStudents.length; stuIndx++) {
            arrSubjects.push({
                "semester": arrStudents[stuIndx]['semester'].toString().padStart(2, '0'),
                "subjectCode": arrStudents[stuIndx]['subCode'],
                "subjectName": toCamelCase(arrStudents[stuIndx]['subName'])
            })
            strTotalAmt = strTotalAmt + arrStudents[stuIndx]['amount']
            strTotalSub = strTotalSub + 1
        }
        strRegulation = arrStudents[0]['regulation']

        // To check final year student for any course
        if (maxSemester['semester'] == pRows[3][0]['maxSemester']) {
            strTotalAmt = "Rs. " + strTotalAmt + "+2000" + "=" + (strTotalAmt + 2000) + " Fee for PC,CSG & Degree Certificate"
        }

        lstStudents.push({
            "studentName": arrStudents[0]['studentName'],
            "registerNo": arrStudents[0]['registerNo'],
            "dateOfBirth": moment(arrStudents[0]['dateOfBirth']).format('DD-MM-YYYY'),
            "degree": arrStudents[0]['degree'],
            "branch": arrStudents[0]['branch'].toUpperCase(),
            "encUrl": arrStudents[0]['studUrl'],
            "subjects": arrSubjects,
            "noOfSubjects": strTotalSub,
            "totalFees": strTotalAmt,
            "doorNo": arrStudents[0]['doorNo'],
            "street": arrStudents[0]['street'],
            "city": arrStudents[0]['city'],
            "district": arrStudents[0]['district'],
            "state": arrStudents[0]['state'],
            "country": arrStudents[0]['country'],
            "pincode": arrStudents[0]['pincode'],
            "mobile": arrStudents[0]['fatherMobile']
        })
    }
    let objRes = {
        "examName": pRows[1][0]['testName'],
        "regulation": strRegulation,
        "collegeName": pRows[0][0]['collegeName'].toUpperCase(),
        "collegeCode": pRows[0][0]['collegeCode'],
        "collegeAddr": pRows[0][0]['collegeAddr'],
        "collegeEncurl": pRows[0][0]['collegeEncUrl'],
        "studentDetails": lstStudents
    }
    return objRes;
}

// module.exports.PrepareHallTicketPreviewForm = (pRows) => {
//     let lstStudents = [];
//     let strRegulation = '';
//     var lstRegno = pRows[2].map(function (obj) { return obj.registerNo; });
//     lstRegno = lstRegno.filter(function (v, i) { return lstRegno.indexOf(v) == i; });

//     for (let indx = 0; indx < lstRegno.length; indx++) {
//         let arrStudents = pRows[2].filter(function (stu) {
//             return stu['registerNo'] == lstRegno[indx]
//         })

//         let arrSubjects = [];
//         let strTotalAmt = 0;
//         let strTotalSub = 0;

//         for (let stuIndx = 0; stuIndx < arrStudents.length; stuIndx++) {
//             arrSubjects.push({
//                 "semester": arrStudents[stuIndx]['semester'].toString().padStart(2, '0'),
//                 "subjectCode": arrStudents[stuIndx]['subCode'],
//                 "subjectName": toCamelCase(arrStudents[stuIndx]['subName'])
//             })
//             strTotalAmt = strTotalAmt + arrStudents[stuIndx]['amount']
//             strTotalSub = strTotalSub + 1
//         }
//         strRegulation = arrStudents[0]['regulation']
//         lstStudents.push({
//             "studentName": arrStudents[0]['studentName'],
//             "registerNo": arrStudents[0]['registerNo'],
//             "dateOfBirth": moment(arrStudents[0]['dateOfBirth']).format('DD-MM-YYYY'),
//             "degree": arrStudents[0]['degree'],
//             "branch": arrStudents[0]['branch'].toUpperCase(),
//             "encUrl": arrStudents[0]['studUrl'],
//             "subjects": arrSubjects,
//             "noOfSubjects": strTotalSub,
//             "totalFees": strTotalAmt,
//             "doorNo": arrStudents[0]['doorNo'],
//             "street": arrStudents[0]['street'],
//             "city": arrStudents[0]['city'],
//             "district": arrStudents[0]['district'],
//             "state": arrStudents[0]['state'],
//             "country": arrStudents[0]['country'],
//             "pincode": arrStudents[0]['pincode'],
//             "mobile": arrStudents[0]['fatherMobile']
//         })
//     }
//     let objRes = {
//         "examName": pRows[1][0]['testName'],
//         "regulation": strRegulation,
//         "collegeName": pRows[0][0]['collegeName'].toUpperCase(),
//         "collegeCode": pRows[0][0]['collegeCode'],
//         "collegeAddr": pRows[0][0]['collegeAddr'],
//         "collegeEncurl": pRows[0][0]['collegeEncUrl'],
//         "studentDetails": lstStudents
//     }
//     return objRes;
// }

function toCamelCase(str) {
    // Lower cases the string
    return str.toLowerCase()
        .replace(/^./, function (str) { return str.toUpperCase(); })
        .replace(/ (.)/g, function ($1) { return $1.toUpperCase(); })
        .replace(/ii/ig, 'II')
}


module.exports.PrepareSubjectDetail = (pRows) => {

    let lstSubject = [];

    let lstDept = pRows.map(item => item.dept)
        .filter((value, index, self) => self.indexOf(value) === index)

    for (let i = 0; i < lstDept.length; i++) {

        let lstSemester = pRows.filter(function (value) {
            return value['dept'] == lstDept[i]
        })

        for (let j = 0; j < lstSemester.length; j++) {
            // To get Regular student count
            let arrRegularSub = pRows.filter(function (sub) {
                return sub['dept'] == lstDept[i] && sub['semester'] == lstSemester[j]['semester'] && (sub['grade'] != 'U' && sub['grade'] != 'RA' && sub['grade'] != 'UA' && sub['grade'] != 'AB')
            })
            let objSub = {
                "dept": lstDept[i],
                "semester": lstSemester[j]['semester'],
                "subjectCode": pRows[0]["subjectCode"],
                "subjectName": pRows[0]["subjectName"],
            };
            if (arrRegularSub.length > 0) {
                objSub["studentRegCount"] = arrRegularSub[0]['studentCount']
            } else
                objSub["studentRegCount"] = 0

            // To get Arriar student count
            let arrArriar = pRows.filter(function (sub) {
                return sub['dept'] == lstDept[i] && sub['semester'] == lstSemester[j]['semester'] && (sub['grade'] == 'U' || sub['grade'] == 'RA' || sub['grade'] == 'UA' || sub['grade'] == 'AB')
            })
            if (arrArriar.length > 0) {
                objSub["studentArrCount"] = arrArriar[0]['studentCount']
            } else
                objSub["studentArrCount"] = 0

            lstSubject.push(objSub);
        }
    }
    return lstSubject;
}

module.exports.PrepareFinalHallTicket = (pRows, pCallback) => {

    let lstStudents = [];
    let strRegulation = '';
    __GenerateQRCode(pRows[2], function callback(pQRCode) {

        var lstRegno = pRows[2].map(function (obj) { return obj.registerNo; });
        lstRegno = lstRegno.filter(function (v, i) { return lstRegno.indexOf(v) == i; });

        for (let indx = 0; indx < lstRegno.length; indx++) {
            let arrStudents = pRows[2].filter(function (stu) {
                return stu['registerNo'] == lstRegno[indx]
            })

            let arrSubjects = [];
            let strTotalSub = 0;
            for (let stuIndx = 0; stuIndx < arrStudents.length; stuIndx++) {

                arrSubjects.push({
                    "semester": arrStudents[stuIndx]['semester'].toString().padStart(2, '0'),
                    "subjectCode": arrStudents[stuIndx]['subCode'],
                    // "subjectName": toCamelCase(arrStudents[stuIndx]['subName']),
                    // "subjectType": toCamelCase(arrStudents[stuIndx]['subType']),
                    "subjectName": arrStudents[stuIndx]['subName'],
                    "subjectType": arrStudents[stuIndx]['subType'],
                    "examDate": (arrStudents[stuIndx]['examDate']) ? moment(arrStudents[stuIndx]['examDate']).format('DD-MM-YYYY') : "-",
                    "examSession": arrStudents[stuIndx]['sessions']
                })
                strTotalSub = strTotalSub + 1;
            }
            strRegulation = arrStudents[0]['regulation']
            let maxSemester = arrStudents.reduce(function (prev, current) {
                return (prev.semester > current.semester) ? prev : current
            });
            let tmpStu = pQRCode.filter(function (obj) {
                return obj["registerNo"] == lstRegno[indx]
            })

            lstStudents.push({
                "studentName": arrStudents[0]['studentName'],
                "registerNo": arrStudents[0]['registerNo'],
                "dateOfBirth": moment(arrStudents[0]['dateOfBirth']).format('DD-MM-YYYY'),
                "degree": arrStudents[0]['degree'],
                "branch": arrStudents[0]['branch'].toUpperCase(),
                "noOfSubjects": strTotalSub,
                "curSemester": maxSemester['semester'].toString().padStart(2, '0'),
                "subjects": arrSubjects,
                "encUrl": arrStudents[0]['studUrl'],
                "encStudCode": arrStudents[0]['studEncCode'],
                "encRollNoQRCode": tmpStu[0]['encRollNoQR']
            })
        }

        let objRes = {
            "examName": pRows[1][0]['testName'],
            "regulation": strRegulation,
            "collegeName": pRows[0][0]['collegeName'].toUpperCase(),
            "collegeCode": pRows[0][0]['collegeCode'],
            "collegeAddr": pRows[0][0]['collegeAddr'],
            "collegeEncurl": pRows[0][0]['collegeEncUrl'],
            "studentDetails": lstStudents
        }
        pCallback(objRes);
    })
}

function __GenerateQRCode(pRows, pCallback) {
    // code39.getBase64(function (err, collegeBarcode) {
    //     if (err) throw err;

    var lstRegno = pRows.map(function (obj) { return { registerNo: obj.registerNo, studEncCode: obj.studEncCode }; });
    lstRegno = lstRegno.filter((value, index, self) => self.map(x => x.registerNo).indexOf(value.registerNo) == index)

    reqAsync.forEachSeries(lstRegno, function (pRow, asyncCallback) {
        let tmp = {
            type: 'DocumentHallTicket',
            id: pRow['studEncCode'].toString(),
            redirecrtUrl: null
        }
        reqQr.toDataURL(JSON.stringify(tmp), (err, url) => {
            if (err) reqLogFile.PrintError(err);
            else
                pRow['encRollNoQR'] = url;
            asyncCallback();
        });
    }, function (err) {
        pCallback(lstRegno);
    });
    // });
}

// To get Day basis University Timetable  and nominal sheet
module.exports.PrepareDayWiseUniversityTimetable = (pRows) => {
    let lstExamStudents = [];
    let lstNominalSheet = [];
    var lstRegulation = pRows.map(function (obj) { return obj.regulation; });
    lstRegulation = lstRegulation.filter(function (v, i) { return lstRegulation.indexOf(v) == i; });
    let strExamMonthYear = pRows[0]['examMonthYear'];

    for (let regIndx = 0; regIndx < lstRegulation.length; regIndx++) {

        let lstExamSub = [];
        let lstTmpSub = pRows.filter(function (obj) {
            return obj['regulation'] == lstRegulation[regIndx]
        });
        var lstSubjects = lstTmpSub.map(function (obj) { return obj.subjectCode; });
        lstSubjects = lstSubjects.filter(function (v, i) { return lstSubjects.indexOf(v) == i; });

        for (let subIndx = 0; subIndx < lstSubjects.length; subIndx++) {
            let strTotal = 0

            let lstTmpDept = pRows.filter(function (obj) {
                return obj['regulation'] == lstRegulation[regIndx] && obj['subjectCode'] == lstSubjects[subIndx]
            });
            let lstDept = lstTmpDept.map(function (obj) { return obj.dept; });
            lstDept = lstDept.filter(function (v, i) { return lstDept.indexOf(v) == i; });

            let lstExamDept = []
            for (let deptIndx = 0; deptIndx < lstDept.length; deptIndx++) {

                let lstTmpBatch = lstTmpDept.filter(function (obj) {
                    return obj['dept'] == lstDept[deptIndx]
                });

                let lstBatch = lstTmpBatch.map(function (obj) { return obj.batch; });
                lstBatch = lstBatch.filter(function (v, i) { return lstBatch.indexOf(v) == i; });

                for (let batIndx = 0; batIndx < lstBatch.length; batIndx++) {
                    let lstRegStu = lstTmpBatch.filter(function (obj) {
                        return obj['batch'] == lstBatch[batIndx] && (obj['grade'] != 'U' && obj['grade'] != 'UA' && obj['grade'] != 'RA' && obj['grade'] != 'AB')
                    })
                    let lstArrStu = lstTmpBatch.filter(function (obj) {
                        return obj['batch'] == lstBatch[batIndx] && (obj['grade'] == 'U' || obj['grade'] == 'UA' || obj['grade'] == 'RA' || obj['grade'] == 'AB')
                    })
                    strTotal = strTotal + lstRegStu.length + lstArrStu.length
                    lstExamDept.push({
                        "deptName": lstDept[deptIndx],
                        "batch": lstBatch[batIndx],
                        "semester": lstTmpBatch[0]['semester'],
                        "regularStudents": lstRegStu.length,
                        "arrearStudents": lstArrStu.length
                    })
                } // end of batc loop
            } // end of dept loop
            lstExamSub.push({
                "name": lstTmpDept[0]['subjectName'],
                "code": lstTmpDept[0]['subjectCode'],
                "examSession": lstTmpDept[0]['examSession'],
                "totalCount": strTotal,
                "dept": lstExamDept
            })

            // prepare Nominal sheet 
            let lstNominalStu = pRows.filter(function (obj) {
                return obj['subjectCode'] == lstSubjects[subIndx]
            }).map(function (item) {
                return item.regNo;
            })

            lstNominalSheet.push({
                subjectCode: lstTmpDept[0]['subjectCode'],
                subjectName: lstTmpDept[0]['subjectName'],
                examDate: moment(lstTmpDept[0]['examDate']).format("DD-MM-YYYY") + " / " + lstTmpDept[0]['examSession'] + ((lstTmpDept[0]['examSession'] == 'FN') ? ' (10AM - 1PM)' : ' (2PM - 5PM)'),
                examSession: lstTmpDept[0]['examSession'],
                questionPaperCode: lstTmpDept[0]['questPaperCode'],
                registerNoList: lstNominalStu
            })

        } // end of subject loop
        lstExamStudents.push({
            "regulation": lstRegulation[regIndx],
            "subjects": lstExamSub
        })
    } // end of regulation loop
    return { "examName": strExamMonthYear, "universityTimeTable": lstExamStudents, "nominalSheet": lstNominalSheet };
}

module.exports.PreparePracticalSheet = (pRows, pInputParam) => {
    let objRes = {
        "examName": pRows[1][0]['examMonth'],
        "regulation": pRows[1][0]['regulation'],
        "collegeName": pRows[0][0]['collegeName'].toUpperCase(),
        "collegeCode": pRows[0][0]['collegeCode']
    };
    if (pRows[2].length > 0) {
        let lstStudents = pRows[2].map(function (obj) { return { "registerNo": obj.registerNo, "studentName": obj.studentName, "photoURL": obj.photoURL, "grade": obj.grade } });

        let lstRegStudents = lstStudents.filter(function (obj) {
            return obj['grade'] == '';
        });
        let lstArrStudents = lstStudents.filter(function (obj) {
            return obj['grade'] == 'U' || obj['grade'] == 'UA' || obj['grade'] == 'RA' || obj['grade'] == 'AB';
        });

        objRes["branchCode"] = pRows[2][0]['branchCode']
        objRes["branchName"] = pRows[2][0]['degree'] + ' - ' + pRows[2][0]['branchName']
        objRes["subjectCode"] = pRows[2][0]['subCode']
        objRes["subjectName"] = pRows[2][0]['subName']
        objRes["examDate"] = moment(pRows[2][0]['examDate']).format("DD-MM-YYYY")
        objRes["examSession"] = pRows[2][0]['examSession']
        objRes["semester"] = pRows[2][0]['semester']
        if (pInputParam['subType'] == 'P') {
            objRes["regStudent"] = lstRegStudents
            objRes["arrStudent"] = lstArrStudents
        } else {
            objRes["studentList"] = lstRegStudents.concat(lstArrStudents)
        }
    }
    return objRes;
}

module.exports.PrepareDispatchAnswerPaper = (pRows) => {
    let blnUpdated = false;
    var lstSubjects = pRows.map(function (obj) { return { "subjectCode": obj.subjectCode, "subjectName": obj.subjectName, "questionPaperCode": obj.questionPaperCode, "testID": obj.testID }; });
    lstSubjects = lstSubjects.filter((value, index, self) => self.map(x => x.subjectCode).indexOf(value.subjectCode) == index)

    let lstTmp = pRows.filter(function (v, i) { return v['status'] != null })
    if (lstTmp.length > 0)
        blnUpdated = true;

    let arrSubjects = [];
    for (let j = 0; j < lstSubjects.length; j++) {
        let lstStu = pRows.filter(function (v, i) { return v['subjectCode'] == lstSubjects[j]['subjectCode'] })
        lstStu = lstStu.map(function (obj) { return { "registerNumber": obj.regNo, "name": obj.stuName, "status": obj.status } })

        // to filter the absent list
        let lstAbsentList = lstStu.filter(function (v, i) { return v['status'] == 'A' })
        lstAbsentList = lstAbsentList.map(function (obj) { return obj.registerNumber })

        // to filter the malpractice list
        let lstMalPracticeList = lstStu.filter(function (v, i) { return v['status'] == 'M' })
        lstMalPracticeList = lstMalPracticeList.map(function (obj) { return obj.registerNumber })

        let lstPresentList = lstStu.filter(function (v, i) { return v['status'] == 'P' })

        arrSubjects.push({
            "subjectName": lstSubjects[j]['subjectName'],
            "subjectCode": lstSubjects[j]['subjectCode'],
            "testID": lstSubjects[j]['testID'],
            "questionPaperCode": lstSubjects[j]['questionPaperCode'],
            "studentList": lstStu,
            "absentList": lstAbsentList,
            "malPracticeList": lstMalPracticeList,
            "presentCount": lstPresentList.length,
            "absentCount": lstAbsentList.length,
        })
    }
    return { "examName": pRows[0]['examName'], "blnUpdated": blnUpdated, "subjects": arrSubjects };
}

module.exports.PrepareDummyNo = (pRows) => {
    if (pRows.length > 0) {
        let blnUpdated = false;
        let arrdummy = pRows.filter(function (obj) {
            return obj['dummyNo'] != null
        })

        if (arrdummy.length > 0) {
            blnUpdated = true;
        }

        let lstRegNo = pRows.map(function (obj) { return obj.regNo });
        let lstDummyNo = [];
        if (!blnUpdated) { // if dummyno is not yet prepared
            for (let k = 0; k < pRows.length; k++) {
                let strTmp = pRows[k]['questionPaperCode'].substring(1, pRows[k]['questionPaperCode'].length)
                pRows[k]['dummyNo'] = strTmp + (k + 1).toString().padStart(3, "0")
            }

            lstDummyNo = pRows.map(function (obj) { return { "registerNo": "", "dummyNo": obj.dummyNo, "packetNo": "" } });
        } else // if dummyno was prepared already
        {
            lstDummyNo = pRows.map(function (obj) { return { "registerNo": obj.regNo, "dummyNo": obj.dummyNo, "packetNo": obj.packetNo } });
            // To Sort by dummyNo 
            lstDummyNo.sort(function (a, b) {
                return a.dummyNo - b.dummyNo
            })
        }
        return { "subCode": pRows[0]['subCode'], "testID": pRows[0]['testID'], "questionPaperCode": pRows[0]['questionPaperCode'], "blnUpdated": blnUpdated, "dummyNoList": lstDummyNo, "regNoList": lstRegNo };
    } else return {}
}


module.exports.PreparePacketDummyNo = (pRows, pCollegeInfo) => {
    let lstResult = [];
    let blnUpdated = false;


    if (pRows.length > 0) {
        let arrPacketNo = pRows.map(function (obj) { return obj.packetNo; });
        arrPacketNo = arrPacketNo.filter(function (v, i) { return arrPacketNo.indexOf(v) == i; });

        // to check external marks either updated / not 
        let arrMarks = pRows.filter(function (item) {
            return item['externalMarks'] >= 0
        })

        if (arrMarks.length > 0)
            blnUpdated = true;

        for (let i = 0; i < arrPacketNo.length; i++) {
            let lstDummy = pRows.filter(function (item) {
                return item['packetNo'] == arrPacketNo[i]
            });

            let arrDummyNoList = lstDummy.map(function (obj) { return { "dummyNo": obj.dummyNo, "mark": (blnUpdated) ? obj.externalMarks : null, "registerNo": obj.registerNo }; });
            lstResult.push({
                "packetNo": arrPacketNo[i],
                "testID": lstDummy[0]['testID'],
                "markUpdated": blnUpdated,
                "studentList": arrDummyNoList
            })

        }
    }
    if (pCollegeInfo.length > 0) {
        let objResult = {
            "collegeName": pCollegeInfo[0]['collegeName'],
            "collegeCode": pCollegeInfo[0]['collegeCode'],
            "examName": (pRows.length > 0) ? pRows[0]['examName'] : '',
            "examDate": (pRows.length > 0) ? moment(pRows[0]['examDate']).format('DD-MM-YYYY') : '',
            "examSession": (pRows.length > 0) ? pRows[0]['examSession'] : '',
            "questionPaperCode": (pRows.length > 0) ? pRows[0]['questionPaperCode'] : '',
            "regulation": (pRows.length > 0) ? pRows[0]['regulation'] : '',
            "packetData": lstResult
        }
        return objResult;
    }
    else
        return lstResult;
}


module.exports.PreparePacketsDummyNo = (pRows, pCollegeInfo) => {
    let lstResult = [];
    let blnUpdated = false;

    if (pRows.length > 0) {
        let arrPacketNo = pRows.map(function (obj) { return obj.packetNo; });
        arrPacketNo = arrPacketNo.filter(function (v, i) { return arrPacketNo.indexOf(v) == i; });

        // to check external marks either updated / not 
        let arrMarks = pRows.filter(function (item) {
            return item['externalMarks'] >= 0
        })

        if (arrMarks.length > 0)
            blnUpdated = true;

        for (let i = 0; i < arrPacketNo.length; i++) {
            let lstDummy = pRows.filter(function (item) {
                return item['packetNo'] == arrPacketNo[i]
            });

            let arrDummyNoList = lstDummy.map(function (obj) { return { "dummyNo": obj.dummyNo, "mark": (blnUpdated) ? obj.externalMarks.toString().padStart(2, '0') : null, "registerNo": obj.registerNo }; });
            lstResult.push({
                "packetNo": arrPacketNo[i],
                "testID": lstDummy[0]['testID'],
                "markUpdated": blnUpdated,
                "studentList": arrDummyNoList,
                "externalInfo": {
                    "examinerName": lstDummy[0]['examinerId'],
                    "examinerDept": lstDummy[0]['examinerDept'],
                    "examinerDesig": lstDummy[0]['examinerDesig'],
                    "examinerCollege": lstDummy[0]['examinerCollege'],
                    "examinerHeadName": lstDummy[0]['examinerHeadId'],
                    "examinerHeadDept": lstDummy[0]['examinerHeadDept'],
                    "examinerHeadDesig": lstDummy[0]['examinerHeadDesig'],
                    "examinerHeadCollege": lstDummy[0]['examinerHeadCollege'],
                    "assistantExaminerName": lstDummy[0]['assistantExaminerId'],
                    "asistExaminerDesig": lstDummy[0]['asistExaminerDesig'],
                    "assistExaminerDept": lstDummy[0]['assistExaminerDept'],
                    "assistExaminerCollege": lstDummy[0]['assistExaminerCollege'],
                    "valDate": moment(lstDummy[0]['valDate']).format("DD-MM-YYYY"),
                    "valSession": lstDummy[0]['valSession']
                }
            })
        }
    }
    if (pCollegeInfo.length > 0) {
        let objResult = {
            "collegeName": pCollegeInfo[0]['collegeName'],
            "collegeCode": pCollegeInfo[0]['collegeCode'],
            "examName": (pRows.length > 0) ? pRows[0]['examName'] : '',
            "examDate": (pRows.length > 0) ? moment(pRows[0]['examDate']).format('DD-MM-YYYY') : '',
            "examSession": (pRows.length > 0) ? pRows[0]['examSession'] : '',
            "questionPaperCode": (pRows.length > 0) ? pRows[0]['questionPaperCode'] : '',
            "regulation": (pRows.length > 0) ? pRows[0]['regulation'] : '',
            "packetData": lstResult
        }
        return objResult;
    }
    else
        return lstResult;
}

module.exports.SetUniversityMark = (pRows) => {
    mUnivMark = pRows;
}

module.exports.PrepareUniversityMarkCollege = (pRows, pBoostMark, pCourseType, pNotifyPassedStu) => {
    let objUnivMarkRpt = {};
    mStudentCurPassedList = [];

    if (pCourseType.toUpperCase() != 'BOTH') {
        pRows = pRows.filter(function (item) {
            return item['courseType'] == pCourseType.toUpperCase()
        })
    }

    let arrDeptList = pRows.map(item => item.deptAcr).filter((value, index, self) => self.indexOf(value) === index)
    let lstDept = [];
    let strDeptPassed = 0, strDeptTotal = 0;
    // arrDeptList = ['IT'];
    for (let deptIndex = 0; deptIndex < arrDeptList.length; deptIndex++) {

        // get all dept list
        let arrDept = pRows.filter(function (item1, pos1) {
            return item1.deptAcr == arrDeptList[deptIndex];
        });

        // let arrCourseList = arrDept.map(function (obj) { return { "courseAcr": obj.courseAcr, "course": obj.course }; });
        // arrCourseList = arrCourseList.filter((value, index, self) => self.map(x => x.courseAcr).indexOf(value.courseAcr) == index)
        let arrCourseList = arrDept.map(function (obj) { return { "courseAcr": obj.courseAcr, "course": obj.course, "courseType": obj.courseType, "courseObj": (obj.course + '-' + obj.courseAcr) }; });
        arrCourseList = arrCourseList.filter((value, index, self) => self.map(x => x.courseObj).indexOf(value.courseObj) == index)

        let lstCourse = [];
        let strCoursePassed = 0, strCourseTotal = 0;
        for (let courseIndex = 0; courseIndex < arrCourseList.length; courseIndex++) {

            // get all course list
            // let arrCourse = arrDept.filter(function (item1, pos1) {
            //     return item1.courseAcr == arrCourseList[courseIndex]['courseAcr'];
            // });
            let arrCourse = arrDept.filter(function (item1, pos1) {
                return item1.courseAcr == arrCourseList[courseIndex]['courseAcr'] && item1.course == arrCourseList[courseIndex]['course'];
            });

            // get unique batch list
            let arrBatchList = arrCourse.map(item => item.batch).filter((value, index, self) => self.indexOf(value) === index)
            let lstBatch = [];
            let strBatchTotal = 0, strBatchPassed = 0;
            for (let batchIndex = 0; batchIndex < arrBatchList.length; batchIndex++) {

                // get all batch list
                let arrBatch = arrCourse.filter(function (item1, pos1) {
                    return item1.batch == arrBatchList[batchIndex];
                });

                // get student list
                let arrStudentList = arrBatch.map(item => item.registerNo).filter((value, index, self) => self.indexOf(value) === index)

                let strAllPassCount = 0;
                let lstSubjects = [];
                for (let index = 0; index < arrStudentList.length; index++) {
                    let blnAllSubjectPass = true;

                    let arrSubject = arrBatch.filter(function (item1, pos1) {
                        return item1.registerNo == arrStudentList[index];
                    });

                    // get subject list
                    let arrSubjectList = arrSubject.map(item => item.subCode).filter((value, index, self) => self.indexOf(value) === index)

                    for (let subIndx = 0; subIndx < arrSubjectList.length; subIndx++) {
                        let strBoostMark = 0;
                        let strAppeared = 0;
                        let strPass = 1;

                        // get registered count
                        let arrRegStudent = arrBatch.filter(function (item1, pos1) {
                            return item1.subCode == arrSubjectList[subIndx]
                        });

                        // get boostup mark
                        let arrBoostMark = pBoostMark.filter(function (objMark) {
                            return objMark.subCode == arrSubjectList[subIndx]
                        })
                        if (arrBoostMark.length > 0)
                            strBoostMark = (arrBoostMark[0]['boostMark'] != "") ? arrBoostMark[0]['boostMark'] : 0;

                        // get student mark data list
                        let arrStudent = arrSubject.filter(function (item1, pos1) {
                            return item1.subCode == arrSubjectList[subIndx]
                        });

                        if (arrStudent.length > 0) {
                            // check apeared/not
                            if (arrStudent[0]['extMark'] != "-1")
                                strAppeared = 1

                            let tmpMark = arrStudent[0]['extMark'] + parseInt(strBoostMark);

                            // check either student pass/fail on this subject
                            let blnPass = this.IsStudentPass(arrCourse[0]['courseType'], arrStudent[0]['regulation'], arrStudent[0]['subType'], tmpMark, arrStudent[0]['intMark'], arrStudent[0]['subCode'])

                            if (!blnPass) {
                                strPass = 0;
                                blnAllSubjectPass = false;
                            }

                            __UpdateSubjectStatus(lstSubjects, arrStudent[0]['subCode'], arrStudent[0]['subName'], arrStudent[0]['subAcr'], arrStudent[0]['subType'], arrRegStudent.length, strBoostMark, strAppeared, strPass)
                            // if (pNotifyPassedStu)
                            //     __PreparePassStudentList(arrStudent[0]['registerNo'], arrStudent[0]['stuName'], arrStudent[0]['subCode'], arrDeptList[deptIndex], arrCourseList[courseIndex]['course'], arrBatchList[batchIndex], strPass);
                        }
                    }
                    if (blnAllSubjectPass) // all subjects are passed
                        strAllPassCount = strAllPassCount + 1
                }

                lstBatch.push({
                    "batch": arrBatchList[batchIndex],
                    "batchTotalStu": arrStudentList.length,
                    "batchPassCount": strAllPassCount,
                    "batchPercentage": ((strAllPassCount / arrStudentList.length) * 100).toFixed(2),
                    "subjectList": lstSubjects
                });
                strBatchTotal = strBatchTotal + arrStudentList.length;
                strBatchPassed = strBatchPassed + strAllPassCount;
            }
            lstCourse.push({
                "courseName": arrCourseList[courseIndex]['course'] + "-" + arrCourseList[courseIndex]['courseAcr'],
                "courseTotalStu": strBatchTotal,
                "coursePassCount": strBatchPassed,
                "coursePercentage": ((strBatchPassed / strBatchTotal) * 100).toFixed(2),
                "batches": lstBatch
            });
            strCourseTotal = strCourseTotal + strBatchTotal;
            strCoursePassed = strCoursePassed + strBatchPassed;
        }

        lstDept.push({
            "deptName": arrDeptList[deptIndex],
            "deptTotalStu": strCourseTotal,
            "deptPassCount": strCoursePassed,
            "deptPercentage": ((strCoursePassed / strCourseTotal) * 100).toFixed(2),
            "course": lstCourse
        });

        strDeptTotal = strDeptTotal + strCourseTotal;
        strDeptPassed = strDeptPassed + strCoursePassed;
    }
    objUnivMarkRpt = {
        "collegePercentage": ((strDeptPassed / strDeptTotal) * 100).toFixed(2),
        "collegeTotalStu": strDeptTotal,
        "collegePassCount": strDeptPassed,
        "dept": lstDept,
        // "passedStudent": mStudentPrevPassedList
    }

    return objUnivMarkRpt;
}

function __PreparePassStudentList(pRegNo, pStuName, pSubCode, pDept, pCourse, pBatch) {
    let arrStudList = mStudentPrevPassedList.filter(function (obj) {
        return obj['regNo'] == pRegNo && obj['subCode'] == pSubCode
    });
    if (arrStudList.length == 0) {
        mStudentPrevPassedList.push({
            "regNo": pRegNo,
            "stuName": pStuName,
            "subCode": pSubCode,
            "dept": pDept,
            "course": pCourse,
            "batch": pBatch
        });
    }
    else {
        if (strPass == 0) {
            mStudentPrevPassedList = mStudentPrevPassedList.filter(function (obj) {
                return obj['regNo'] != pRegNo && obj['subCode'] != pSubCode
            });
        }
    }
}

function __UpdateSubjectStatus(pLstSubject, pSubCode, pSubName, pSubAcr, pSubType, pStuTotal, pBoostMark, pAppeared, pPassed) {
    let subjts = pLstSubject.filter(function (obj) {
        return obj.subCode == pSubCode;
    })
    if (subjts.length > 0) {
        // subjts[0]['regCnt'] = pStuTotal
        subjts[0]['aprdCnt'] = subjts[0]['aprdCnt'] + pAppeared
        subjts[0]['passCnt'] = subjts[0]['passCnt'] + pPassed
        subjts[0]['passPercentage'] = parseFloat((subjts[0]['passCnt'] / subjts[0]['regCnt']) * 100).toFixed(2)
    } else {
        pLstSubject.push({
            "subCode": pSubCode,
            "subAcr": pSubAcr,
            "subName": pSubName,
            "subType": pSubType,
            "regCnt": pStuTotal,
            "aprdCnt": pAppeared,
            "passCnt": pPassed,
            "passPercentage": parseFloat((pPassed / pStuTotal) * 100).toFixed(2),
            "markAdded": (pBoostMark == 0) ? '' : pBoostMark
        });
    }
}

function __UpdateSubjectStatusbyDept(pLstSubject, pSubCode, pSubName, pSubAcr, pSubType, pStuTotal, pBoostMark, pAppeared, pPassed, pRevalPassed) {
    let subjts = pLstSubject.filter(function (obj) {
        return obj.subCode == pSubCode;
    })
    if (subjts.length > 0) {
        subjts[0]['aprdCnt'] = subjts[0]['aprdCnt'] + pAppeared
        subjts[0]['passCnt'] = subjts[0]['passCnt'] + pPassed
        subjts[0]['passPercentage'] = parseFloat((subjts[0]['passCnt'] / subjts[0]['regCnt']) * 100).toFixed(2)
        subjts[0]["afterRevalPassCount"] = subjts[0]['afterRevalPassCount'] + pRevalPassed
        subjts[0]["afterRevalPassPercentage"] = parseFloat((subjts[0]['afterRevalPassCount'] / subjts[0]['regCnt']) * 100).toFixed(2)
    } else {
        pLstSubject.push({
            "subCode": pSubCode,
            "subAcr": pSubAcr,
            "subName": pSubName,
            "subType": pSubType,
            "regCnt": pStuTotal,
            "aprdCnt": pAppeared,
            "passCnt": pPassed,
            "passPercentage": parseFloat((pPassed / pStuTotal) * 100).toFixed(2),
            "afterRevalPassCount": pRevalPassed,
            "afterRevalPassPercentage": parseFloat((pRevalPassed / pStuTotal) * 100).toFixed(2),
            "markAdded": (pBoostMark == 0) ? '' : pBoostMark
        });
    }
}

function __UpdateEarnedCredit(pGrade, pStudents) {
    if (pGrade != undefined) {
        for (stuIndx = 0; stuIndx < pStudents.length; stuIndx++) {
            if (pStudents[stuIndx]['grade'] != null && pStudents[stuIndx]['earnedCredit'] == null) {
                let arrGrade = pGrade.filter(function (obj) {
                    return obj['regulation'] == pStudents[stuIndx]['regulation'] && obj['grade'] == pStudents[stuIndx]['grade']
                })
                if (arrGrade.length > 0)
                    pStudents[stuIndx]['earnedCredit'] = arrGrade[0]['grade_point']
            }
        }
    }
}

module.exports.AddBoostupToUniversityMark = (pBoostupMark, pCourseType) => {
    let lstUnivMark = mUnivMark;
    return module.exports.PrepareUniversityMarkCollege(lstUnivMark, pBoostupMark, pCourseType, true);
}

module.exports.PrepareUnivMarkAnalysisByDept = (pResultRows) => {
    let objUnivMarkRpt = {};
    let pRows = pResultRows[0];

    let blnRevaluation = false;
    if (pResultRows[1] && pResultRows[1][0]['revaluation'] > 0)
        blnRevaluation = true;

    // let arrDeptList = pRows.map(item => item.deptAcr).filter((value, index, self) => self.indexOf(value) === index)
    let arrDeptList = pRows.map(function (obj) { return { "deptAcr": obj.deptAcr, "deptName": obj.deptName }; });
    arrDeptList = arrDeptList.filter((value, index, self) => self.map(x => x.deptAcr).indexOf(value.deptAcr) == index)


    let lstDept = [];
    let strDeptPassed = 0, strDeptTotal = 0, strRevalDeptPassed = 0;
    // arrDeptList = ['IT'];
    for (let deptIndex = 0; deptIndex < arrDeptList.length; deptIndex++) {

        // get all dept list
        let arrDept = pRows.filter(function (item1, pos1) {
            return item1.deptAcr == arrDeptList[deptIndex]['deptAcr'];
        });

        let arrCourseList = arrDept.map(function (obj) { return { "courseAcr": obj.courseAcr, "course": obj.course, "courseType": obj.courseType, "courseObj": (obj.course + '-' + obj.courseAcr) }; });
        arrCourseList = arrCourseList.filter((value, index, self) => self.map(x => x.courseObj).indexOf(value.courseObj) == index)


        let lstCourse = [];
        let strCoursePassed = 0, strCourseTotal = 0, strRevalCoursePassed = 0;
        for (let courseIndex = 0; courseIndex < arrCourseList.length; courseIndex++) {

            // get all course list
            let arrCourse = arrDept.filter(function (item1, pos1) {
                return item1.courseAcr == arrCourseList[courseIndex]['courseAcr'] && item1.course == arrCourseList[courseIndex]['course'];
            });


            // get unique batch list
            let arrBatchList = arrCourse.map(item => item.batch).filter((value, index, self) => self.indexOf(value) === index)
            let lstBatch = [];
            let strBatchTotal = 0, strBatchPassed = 0, strRevalBatchPassed = 0;
            for (let batchIndex = 0; batchIndex < arrBatchList.length; batchIndex++) {

                // get all batch list
                let arrBatch = arrCourse.filter(function (item1, pos1) {
                    return item1.batch == arrBatchList[batchIndex];
                });

                let arrSectionList = arrBatch.map(item => item.section).filter((value, index, self) => self.indexOf(value) === index)

                let strSectionTotal = 0, strSectionPassed = 0, strRevalSectionPassed = 0;
                let lstSec = [];
                for (let sectionIndex = 0; sectionIndex < arrSectionList.length; sectionIndex++) {
                    // get all section list
                    let arrSection = arrBatch.filter(function (item1, pos1) {
                        return item1.section == arrSectionList[sectionIndex];
                    });


                    // get student list
                    let arrStudentList = arrSection.map(item => item.registerNo).filter((value, index, self) => self.indexOf(value) === index)

                    let strAllPassCount = 0, strRevalAllPassCount = 0;
                    let lstSubjects = [];
                    for (let index = 0; index < arrStudentList.length; index++) {
                        let blnAllSubjectPass = true, blnRevalAllSubjectPass = true;

                        let arrSubject = arrSection.filter(function (item1, pos1) {
                            return item1.registerNo == arrStudentList[index];
                        });

                        // get subject list
                        let arrSubjectList = arrSection.map(item => item.subCode).filter((value, index, self) => self.indexOf(value) === index)
                        // arrSubjectList = ['19MA3201'];
                        for (let subIndx = 0; subIndx < arrSubjectList.length; subIndx++) {

                            let strAppeared = 0;
                            let strPass = 1, strRevalPass = 1;

                            // get registered count
                            let arrRegStudent = arrSection.filter(function (item1, pos1) {
                                return item1.subCode == arrSubjectList[subIndx]
                            });


                            // get student mark data list
                            let arrStudent = arrSubject.filter(function (item1, pos1) {
                                return item1.subCode == arrSubjectList[subIndx]
                            });

                            if (arrStudent.length > 0) {
                                // check apeared/not
                                if (arrStudent[0]['extMark'] != "-1")
                                    strAppeared = 1

                                let extMark = arrStudent[0]['extMark'] + parseInt(arrStudent[0]['boostMark'])
                                let blnPass = this.IsStudentPass(arrStudent[0]['courseType'], arrStudent[0]['regulation'], arrStudent[0]['subType'], extMark, arrStudent[0]['intMark'], arrStudent[0]['subCode']);
                                if (!blnPass) {
                                    strPass = 0; blnAllSubjectPass = false;
                                }

                                if (arrStudent[0]['revalType'] == 2) {
                                    let revalMark = arrStudent[0]['revalMark']
                                    if (!this.IsStudentPass(arrStudent[0]['courseType'], arrStudent[0]['regulation'], arrStudent[0]['subType'], revalMark, arrStudent[0]['intMark'], arrStudent[0]['subCode'])) {
                                        strRevalPass = 0; blnRevalAllSubjectPass = false;
                                    }
                                } else {
                                    if (!blnPass) {
                                        strRevalPass = 0; blnRevalAllSubjectPass = false;
                                    }
                                }

                                __UpdateSubjectStatusbyDept(lstSubjects, arrStudent[0]['subCode'], arrStudent[0]['subName'], arrStudent[0]['subAcr'], arrStudent[0]['subType'], arrRegStudent.length, 0, strAppeared, strPass, strRevalPass)
                            }
                        }
                        if (blnAllSubjectPass) // all subjects are passed
                            strAllPassCount = strAllPassCount + 1
                        if (blnRevalAllSubjectPass) // all subject passed  after revaluation
                            strRevalAllPassCount = strRevalAllPassCount + 1


                    }
                    lstSec.push({
                        "section": arrSectionList[sectionIndex],
                        "sectionTotalStu": arrStudentList.length,
                        "sectionPassCount": strAllPassCount,
                        "sectionPercentage": ((strAllPassCount / arrStudentList.length) * 100).toFixed(2),
                        "afterRevalSectionPassCount": strRevalAllPassCount,
                        "afterRevalSectionPercentage": ((strRevalAllPassCount / arrStudentList.length) * 100).toFixed(2),
                        "subjectList": lstSubjects
                    })

                    strSectionTotal = strSectionTotal + arrStudentList.length;
                    strSectionPassed = strSectionPassed + strAllPassCount;
                    strRevalSectionPassed = strRevalSectionPassed + strRevalAllPassCount;
                }
                lstBatch.push({
                    "batch": arrBatchList[batchIndex],
                    "batchTotalStu": strSectionTotal,
                    "batchPassCount": strSectionPassed,
                    "batchPercentage": ((strSectionPassed / strSectionTotal) * 100).toFixed(2),
                    "afterRevalBatchPassCount": strRevalSectionPassed,
                    "afterRevalBatchPercentage": ((strRevalSectionPassed / strSectionTotal) * 100).toFixed(2),
                    "section": lstSec
                });
                strBatchTotal = strBatchTotal + strSectionTotal;
                strBatchPassed = strBatchPassed + strSectionPassed;
                strRevalBatchPassed = strRevalBatchPassed + strRevalSectionPassed;
            }
            lstCourse.push({
                "courseName": arrCourseList[courseIndex]['course'] + "-" + arrCourseList[courseIndex]['courseAcr'],
                "courseType": arrCourseList[courseIndex]['courseType'],
                "courseTotalStu": strBatchTotal,
                "coursePassCount": strBatchPassed,
                "coursePercentage": ((strBatchPassed / strBatchTotal) * 100).toFixed(2),
                "afterRevalCoursePassCount": strRevalBatchPassed,
                "afterRevalCoursePercentage": ((strRevalBatchPassed / strBatchTotal) * 100).toFixed(2),
                "batches": lstBatch
            });
            strCourseTotal = strCourseTotal + strBatchTotal;
            strCoursePassed = strCoursePassed + strBatchPassed;
            strRevalCoursePassed = strRevalCoursePassed + strRevalBatchPassed;
        }

        lstDept.push({
            "deptName": arrDeptList[deptIndex]['deptName'],
            "deptTotalStu": strCourseTotal,
            "deptPassCount": strCoursePassed,
            "deptPercentage": ((strCoursePassed / strCourseTotal) * 100).toFixed(2),
            "afterRevalDeptPassCount": strRevalCoursePassed,
            "afterRevalDeptPercentage": ((strRevalCoursePassed / strCourseTotal) * 100).toFixed(2),
            "course": lstCourse
        });
        // console.log("dept :" + arrDeptList[deptIndex])

        strDeptTotal = strDeptTotal + strCourseTotal;
        strDeptPassed = strDeptPassed + strCoursePassed;
        strRevalDeptPassed = strRevalDeptPassed + strRevalCoursePassed;
    }
    objUnivMarkRpt = {
        "collegePercentage": ((strDeptPassed / strDeptTotal) * 100).toFixed(2),
        "collegeTotalStu": strDeptTotal,
        "collegePassCount": strDeptPassed,
        "afterRevalCollegePassCount": strRevalDeptPassed,
        "afterRevalCollegePercentage": ((strRevalDeptPassed / strDeptTotal) * 100).toFixed(2),
        "revaluation": blnRevaluation,
        "dept": lstDept
    }
    return objUnivMarkRpt;
}

module.exports.PrepareProvisionalResult = (pRows, pParam) => {
    let objResult = {};

    let arrSemester = pRows[2].map(function (obj) { return obj.semester; });
    arrSemester = arrSemester.filter((value, index, self) => self.map(x => x).indexOf(value) == index)

    // To Sort by Semester 
    arrSemester.sort(function (a, b) {
        return a - b
    })

    let lstSemester = [];
    let strTotalPages = 0;
    for (let i = 0; i < arrSemester.length; i++) {

        let arrSemSubjects = pRows[2].filter(function (obj) {
            return obj['semester'] == arrSemester[i]
        })
        arrSemSubjects = arrSemSubjects.map(function (obj) { return { "subCode": obj.subCode, "subName": obj.subName, "subAcrn": obj.subAcrn }; });


        let arrSemStudents = pRows[1].filter(function (obj) {
            return obj['semester'] == arrSemester[i]
        })

        let lstUniqueStudents = arrSemStudents.map(function (obj) { return { "registerNo": obj.registerNo, "studentName": obj.studentName }; });
        lstUniqueStudents = lstUniqueStudents.filter((value, index, self) => self.map(x => x.registerNo).indexOf(value.registerNo) == index)

        let lstStudents = [];
        for (let stuIndx = 0; stuIndx < lstUniqueStudents.length; stuIndx++) {

            //  studentStatus (is_active = 9) => with held students
            let lstSubjects = arrSemStudents.filter(function (obj) { return obj['registerNo'] == lstUniqueStudents[stuIndx]['registerNo'] })
            lstSubjects = lstSubjects.map(function (obj) {
                return {
                    "subCode": obj.subCode, "subName": obj.subName,
                    "grade": (obj['studentStatus'] == 9) ? "WH" : (pParam['revalType'] == 2) ? ((obj.grade == obj.revalGrade) ? "NC" : obj.revalGrade) : obj.grade
                };
            });

            lstStudents.push({
                "registerNo": lstUniqueStudents[stuIndx]['registerNo'],
                "studentName": lstUniqueStudents[stuIndx]['studentName'],
                "subjList": lstSubjects
            })
        }
        lstSemester.push({
            "semester": arrSemester[i].toString().padStart(2, '0'),
            "subjectList": arrSemSubjects,
            "studentList": lstStudents
        })
        strTotalPages = strTotalPages + Math.round(lstUniqueStudents.length / 18)
    }
    return objResult = {
        "collegeCode": pRows[2][0]['collegeCode'],
        "collegeName": pRows[2][0]['collegeName'].toUpperCase(),
        "examName": pRows[0][0]['examName'],
        "deptCode": pRows[1][0]['deptCode'],
        "branch": pRows[1][0]['degree'] + "-" + pRows[1][0]['branch'],
        "noofPages": strTotalPages,
        "semesterList": lstSemester
    }
}

// module.exports.PrepareProvisionalResult = (pRows, pParam) => {
//     let objResult = {};

//     let arrSemester = pRows[2].map(function (obj) { return obj.semester; });
//     arrSemester = arrSemester.filter((value, index, self) => self.map(x => x).indexOf(value) == index)

//     // To Sort by Semester 
//     arrSemester.sort(function (a, b) {
//         return a - b
//     })

//     let lstSemester = [];
//     let strTotalPages = 0;
//     for (let i = 0; i < arrSemester.length; i++) {

//         let arrSemSubjects = pRows[2].filter(function (obj) {
//             return obj['semester'] == arrSemester[i]
//         })
//         arrSemSubjects = arrSemSubjects.map(function (obj) { return { "subCode": obj.subCode, "subName": obj.subName, "subAcrn": obj.subAcrn }; });


//         let arrSemStudents = pRows[1].filter(function (obj) {
//             return obj['semester'] == arrSemester[i]
//         })

//         let lstUniqueStudents = arrSemStudents.map(function (obj) { return { "registerNo": obj.registerNo, "studentName": obj.studentName }; });
//         lstUniqueStudents = lstUniqueStudents.filter((value, index, self) => self.map(x => x.registerNo).indexOf(value.registerNo) == index)

//         let lstStudents = [];
//         for (let stuIndx = 0; stuIndx < lstUniqueStudents.length; stuIndx++) {

//             let lstSubjects = arrSemStudents.filter(function (obj) { return obj['registerNo'] == lstUniqueStudents[stuIndx]['registerNo'] })
//             lstSubjects = lstSubjects.map(function (obj) {
//                 return {
//                     "subCode": obj.subCode, "subName": obj.subName,
//                     "grade": (pParam['revalType'] == 2) ? ((obj.grade == obj.revalGrade) ? "NC" : obj.revalGrade) : obj.grade
//                 };
//             });

//             lstStudents.push({
//                 "registerNo": lstUniqueStudents[stuIndx]['registerNo'],
//                 "studentName": lstUniqueStudents[stuIndx]['studentName'],
//                 "subjList": lstSubjects
//             })
//         }
//         lstSemester.push({
//             "semester": arrSemester[i].toString().padStart(2, '0'),
//             "subjectList": arrSemSubjects,
//             "studentList": lstStudents
//         })
//         strTotalPages = strTotalPages + Math.round(lstUniqueStudents.length / 18)
//     }
//     return objResult = {
//         "collegeCode": pRows[2][0]['collegeCode'],
//         "collegeName": pRows[2][0]['collegeName'].toUpperCase(),
//         "examName": pRows[0][0]['examName'],
//         "deptCode": pRows[1][0]['deptCode'],
//         "branch": pRows[1][0]['degree'] + "-" + pRows[1][0]['branch'],
//         "noofPages": strTotalPages,
//         "semesterList": lstSemester
//     }
// }

module.exports.PrepareUnivMarkAnalysisClassWise = (pResultRows) => {
    let objResult = {}
    if (pResultRows[0].length > 0) {
        let pRows = pResultRows[0]
        let blnRevaluation = false;
        if (pResultRows[1] && pResultRows[1][0]['revaluation'] > 0)
            blnRevaluation = true;

        objResult = {
            "collegeName": pRows[0]['collegeName'],
            "examName": pRows[0]['examName'],
            "deptName": pRows[0]['dept'],
            "batch": pRows[0]['batch'],
            "semester": pRows[0]['semester'].toString().padStart(2, '0'),
            "revaluation": blnRevaluation
        }

        let arrStudList = pRows.map(function (obj) { return { "regNo": obj.regNo, "stuName": obj.stuName, "section": obj.section }; });
        arrStudList = arrStudList.filter((value, index, self) => self.map(x => x.regNo).indexOf(value.regNo) == index)

        let SubList = pRows.map(function (obj) { return { "subCode": obj.subCode, "subName": obj.subName, "subAcrn": obj.subAcrn, "subCredit": obj.subCredit, "staffName": obj.staffName }; });
        SubList = SubList.filter((value, index, self) => self.map(x => x.subCode).indexOf(value.subCode) == index)

        let arrStu = [];
        let strAllPassCount = 0, strRevalAllPassCount = 0;
        let subCreditTotal = 0
        for (let stuIndx = 0; stuIndx < arrStudList.length; stuIndx++) {

            let objStu = {
                "RegisterNumber": arrStudList[stuIndx]['regNo'],
                "StudentName": arrStudList[stuIndx]['stuName']
            }

            let arrTemp = pRows.filter(function (item) {
                return item['regNo'] == arrStudList[stuIndx]['regNo']
            })

            let earnedCreditTotal = 0, arrearCount = 0, revalArrearCount = 0, subCreditsEarned = 0;
            subCreditTotal = 0

            for (let subIndx = 0; subIndx < SubList.length; subIndx++) {
                let arrStu = pRows.filter(function (obj) {
                    return obj['regNo'] == arrStudList[stuIndx]['regNo'] && obj['subCode'] == SubList[subIndx]['subCode']
                })
                let subKey = SubList[subIndx]['subCode'] + " " + SubList[subIndx]['subAcrn'] + "(" + SubList[subIndx]['subCredit'] + ")"
                if (arrStu.length > 0) {

                    let extMark = arrStu[0]['extMark']
                    let blnPass = this.IsStudentPass(arrStu[0]['courseType'], arrStu[0]['regulation'], arrStu[0]['subType'], extMark, arrStu[0]['intMark'], arrStu[0]['subCode'])
                    if (!blnPass) {
                        arrearCount = arrearCount + 1
                    }

                    if (arrStu[0]['revalType'] == 2) { // Revaluation mark and grade
                        let revalMark = arrStu[0]['revalMark']
                        if (!this.IsStudentPass(arrStu[0]['courseType'], arrStu[0]['regulation'], arrStu[0]['subType'], revalMark, arrStu[0]['intMark'], arrStu[0]['subCode'])) {
                            revalArrearCount = revalArrearCount + 1
                        }

                        objStu[subKey] = {
                            "grade": arrStu[0]['revalGrade'],
                            "internal": arrStu[0]['intMark']
                        }
                        subCreditTotal = subCreditTotal + arrStu[0]['subCredit']
                        subCreditsEarned = subCreditsEarned + ((arrStu[0]['revalEarnedCredit'] == 0) ? 0 : arrStu[0]['subCredit'])
                        earnedCreditTotal = earnedCreditTotal + (arrStu[0]['subCredit'] * arrStu[0]['revalEarnedCredit'])

                    } else { // end semester mark and grade
                        if (!blnPass) {
                            revalArrearCount = revalArrearCount + 1
                        }
                        objStu[subKey] = {
                            "grade": arrStu[0]['grade'],
                            "internal": arrStu[0]['intMark']
                        }
                        subCreditTotal = subCreditTotal + arrStu[0]['subCredit']
                        subCreditsEarned = subCreditsEarned + ((arrStu[0]['earnedCredit'] == 0) ? 0 : arrStu[0]['subCredit'])
                        earnedCreditTotal = earnedCreditTotal + (arrStu[0]['subCredit'] * arrStu[0]['earnedCredit'])

                    }
                } else {
                    objStu[subKey] = {
                        "grade": "-",
                        "internal": "-"
                    }
                }
            }

            strAllPassCount = strAllPassCount + ((arrearCount == 0) ? 1 : 0)
            strRevalAllPassCount = strRevalAllPassCount + ((revalArrearCount == 0) ? 1 : 0)
            let totalKey = "Total (" + subCreditTotal + ")"
            objStu[totalKey] = earnedCreditTotal
            objStu['GPA (10.0)'] = parseFloat(earnedCreditTotal / subCreditsEarned).toFixed(2)
            objStu['NoOfSubjectFailed'] = revalArrearCount
            arrStu.push(objStu)
        }

        let arrSubList = pRows.map(function (obj) { return { "subCode": obj.subCode, "subName": obj.subName, "subAcrn": obj.subAcrn, "subCredit": obj.subCredit, "staffName": obj.staffName, "subType": obj.subType }; });
        arrSubList = arrSubList.filter((value, index, self) => self.map(x => x.subCode).indexOf(value.subCode) == index)

        let subjectList = [];

        for (let subIndx = 0; subIndx < arrSubList.length; subIndx++) {
            let arrStudent = pRows.filter(function (obj) {
                return obj['subCode'] == arrSubList[subIndx]['subCode']
            })

            let strFailureCount = 0, strRevalFailureCount = 0;
            for (let stuIndx = 0; stuIndx < arrStudent.length; stuIndx++) {
                let blnPass = this.IsStudentPass(arrStudent[stuIndx]['courseType'], arrStudent[stuIndx]['regulation'], arrStudent[stuIndx]['subType'], arrStudent[stuIndx]['extMark'], arrStudent[stuIndx]['intMark'], arrStudent[stuIndx]['subCode'])
                if (!blnPass)
                    strFailureCount = strFailureCount + 1

                //if Revaluation applied
                if (arrStudent[stuIndx]['revalType'] == 2) {
                    let blnRevalPass = this.IsStudentPass(arrStudent[stuIndx]['courseType'], arrStudent[stuIndx]['regulation'], arrStudent[stuIndx]['subType'], arrStudent[stuIndx]['revalMark'], arrStudent[stuIndx]['intMark'], arrStudent[stuIndx]['subCode'])
                    if (!blnRevalPass)
                        strRevalFailureCount = strRevalFailureCount + 1
                } else {// if Revaluation not applied
                    if (!blnPass)
                        strRevalFailureCount = strRevalFailureCount + 1
                }
            }

            let arrAbsentStu = arrStudent.filter(function (obj) {
                return obj['extMark'] == -1
            })

            subjectList.push({
                "subCode": arrSubList[subIndx]['subCode'],
                "subName": arrSubList[subIndx]['subName'],
                "subAcrn": arrSubList[subIndx]['subAcrn'],
                "staffName": arrSubList[subIndx]['staffName'],
                "credits": arrSubList[subIndx]['subCredit'],
                "noOfFailures": strFailureCount,
                "noOfAbsentees": arrAbsentStu.length,
                "noOfRegistered": arrStudent.length,
                "noOfAppeared": arrStudent.length - arrAbsentStu.length,
                "noOfPassed": arrStudent.length - strFailureCount,
                "passPercentage": (parseFloat((arrStudent.length - strFailureCount) / arrStudent.length) * 100).toFixed(2),
                "afterRevalPassed": arrStudent.length - strRevalFailureCount,
                "afterRevalPassPercentage": (parseFloat((arrStudent.length - strRevalFailureCount) / arrStudent.length) * 100).toFixed(2)
            })
        }
        objResult['overallPassCount'] = strAllPassCount
        objResult['overallPassPercentage'] = parseFloat((strAllPassCount / arrStudList.length) * 100).toFixed(2)
        objResult['afterRevalOverallPassCount'] = strRevalAllPassCount
        objResult['afterRevalOverallPassPercentage'] = parseFloat((strRevalAllPassCount / arrStudList.length) * 100).toFixed(2)
        objResult['totalCredit'] = subCreditTotal
        objResult['GPA'] = "10.0"
        objResult['studentList'] = arrStu
        objResult['subjectList'] = subjectList
    }
    return objResult
}

/** To prepare External and Internal mark report */
module.exports.PrepareExternalInternalMarkReport = (pRows) => {
    let objResult = {}
    if (pRows.length > 0) {

        let strPassMark = this.GetPassMark(pRows[0]['courseType'])

        let arrStudList = pRows.map(function (obj) { return { "registerNo": obj.registerNo, "stuName": obj.stuName }; });
        arrStudList = arrStudList.filter((value, index, self) => self.map(x => x.registerNo).indexOf(value.registerNo) == index)

        let arrSubList = pRows.map(function (obj) { return { "subCode": obj.subCode, "subName": obj.subName, "subAcr": obj.subAcr }; });
        arrSubList = arrSubList.filter((value, index, self) => self.map(x => x.subCode).indexOf(value.subCode) == index)

        objResult = {
            "examName": pRows[0]['testAcr'],
            "deptAcr": pRows[0]['deptAcr'],
            "deptName": pRows[0]['deptName'],
            "course": pRows[0]['course'],
            "batch": pRows[0]['batch'],
            "currentSemester": pRows[0]['semester'].toString().padStart(2, "0")
        }

        let arrStu = [];
        for (let stuIndx = 0; stuIndx < arrStudList.length; stuIndx++) {

            let objStu = { "Register No": arrStudList[stuIndx]['registerNo'], "Student Name": arrStudList[stuIndx]['stuName'] }

            for (let subIndx = 0; subIndx < arrSubList.length; subIndx++) {
                let arrTemp = pRows.filter(function (item) {
                    return item['registerNo'] == arrStudList[stuIndx]['registerNo'] && item['subCode'] == arrSubList[subIndx]['subCode']
                })
                let subKey = arrSubList[subIndx]['subCode'] + "-" + arrSubList[subIndx]['subAcr']
                if (arrTemp.length > 0) {

                    let extMark = arrTemp[0]['extMark'] + parseInt(arrTemp[0]['boostMark'], 0);

                    let totalMark = this.CalculateExternalMark(arrTemp[0]['regulation'], arrTemp[0]['subType'], extMark, arrTemp[0]['intMark'], arrTemp[0]['subCode'])
                    let blnPass = this.IsStudentPass(arrTemp[0]['courseType'], arrTemp[0]['regulation'], arrTemp[0]['subType'], extMark, arrTemp[0]['intMark'], arrTemp[0]['subCode'])

                    let strFail = "True"
                    if (blnPass)
                        strFail = "False"

                    let strExternalPass = (extMark >= strPassMark) ? "True" : "False";

                    let strInternalMark = (this.IsNoInternalSubject(arrSubList[subIndx]['subCode'])) ? "-" : arrTemp[0]['intMark']

                    let strExternalMark = ""
                    if (arrTemp[0]['extMark'] == "-1")
                        strExternalMark = "AB"
                    else if (arrTemp[0]['extMark'] == "-2")
                        strExternalMark = "M"
                    else if (arrTemp[0]['extMark'] == "-3")
                        strExternalMark = "P"
                    else
                        strExternalMark = extMark

                    objStu[subKey] =
                        { "Int": strInternalMark, "Ext": strExternalMark, "Tot": totalMark, "G": arrTemp[0]['grade'], "Fail": strFail, "extAbv45": strExternalPass }
                }
                else {
                    objStu[subKey] =
                        { "Int": "-", "Ext": "-", "Tot": "-", "G": '-', "Fail": "-", "extAbv45": "-" }

                }
            }
            arrStu.push(objStu);
        }
        objResult['studentList'] = arrStu
        objResult['subjectList'] = arrSubList
    }
    return objResult
}

module.exports.PrepareDummyNoData = (pRows) => {
    if (pRows.length > 0) {
        let blnUpdated = false;
        let arrdummy = pRows.filter(function (obj) {
            return obj['dummyNo'] != null
        })

        if (arrdummy.length > 0) {
            blnUpdated = true;
        }

        var lstCourses = pRows.map(function (obj) { return { "courseCode": obj.courseCode, "courseDegree": obj.courseDegree, "courseAcr": obj.courseAcr }; });
        lstCourses = lstCourses.filter((value, index, self) => self.map(x => x.courseCode).indexOf(value.courseCode) == index)

        let lstDummyNo = [];
        let arrCourses = [];
        let strSeqNo = 0;
        for (let i = 0; i < lstCourses.length; i++) {
            let lstCourse = pRows.filter(function (obj) {
                return obj.courseCode == lstCourses[i]['courseCode']
            })

            let lstRegNo = [];
            if (!blnUpdated) { // if dummyno is not yet prepared
                for (let k = 0; k < lstCourse.length; k++) {
                    strSeqNo = strSeqNo + 1;
                    let strTmp = lstCourse[k]['questionPaperCode'].substring(1, lstCourse[k]['questionPaperCode'].length)
                    lstCourse[k]['dummyNo'] = strTmp + (strSeqNo).toString().padStart(3, "0")
                }

                lstDummyNo = lstDummyNo.concat(lstCourse.map(function (obj) { return obj.dummyNo }));
                lstRegNo = lstCourse.map(function (obj) { return { "registerNo": obj.regNo, "dummyNo": null, "packetNo": "", "batch": obj.batch } });
                // To Sort by dummyNo 
                lstRegNo.sort(function (a, b) {
                    return a.registerNo - b.registerNo
                })
            } else // if dummyno was prepared already
            {
                lstDummyNo = lstDummyNo.concat(lstCourse.map(function (obj) { return obj.dummyNo }));

                lstRegNo = lstCourse.map(function (obj) { return { "registerNo": obj.regNo, "dummyNo": obj.dummyNo, "packetNo": obj.packetNo, "batch": obj.batch } });
                // To Sort by dummyNo 
                lstRegNo.sort(function (a, b) {
                    return a.dummyNo - b.dummyNo
                })
            }

            arrCourses.push({
                "courseCode": lstCourses[i]['courseCode'],
                "courseName": lstCourses[i]['courseDegree'] + ' - ' + lstCourses[i]['courseAcr'],
                "regNoList": lstRegNo
            })
        }
        return { "subCode": pRows[0]['subCode'], "testID": pRows[0]['testID'], "questionPaperCode": pRows[0]['questionPaperCode'], "blnUpdated": blnUpdated, "dummyNoList": lstDummyNo, "courseList": arrCourses };
    } else return {}
}


module.exports.IsNoInternalSubject = (pSubCode) => {
    let arrSubjects = ["HS8381", "ME6713", "BA5311", "19IS1912", "ME8712", "CE8711", "CE8712", "19BA3904", "19IS3912", "19IT3AP1", "19IT1L01", "20CA1M01", "19GE3M01"]
    if (arrSubjects.indexOf(pSubCode) > -1)
        return true
    else
        return false
}

module.exports.CalculateExternalMark = (pRegulation, pSubType, pExternalMark, pInternalMark, pSubCode) => {
    /**
        * R2013 & R2017 => 
        *    SubType => Theory, Practical =>
        *      External - 80
        *      Internal - 20
        * R2019 => 
        *    SubType => Theory, 
        *      External - 60
        *      Internal - 40
        *    SubType => Practical, 
        *      External - 50
        *      Internal - 50
        *    SubType => Theory Come Practical, 
        *      External - 50
        *      Internal - 50 (Theory Test -30(CAT1,CAT2...) , Practical - 20 (exper(10), test(10)) )
        */
    pExternalMark = (pExternalMark < 0) ? 0 : pExternalMark;
    let extMark = pExternalMark;
    if (pRegulation == 'R2013' || pRegulation == 'R2017') {
        extMark = (pExternalMark / 100) * 80;
    } else if (pRegulation == 'R2019' || pRegulation == 'R2020') {
        if (pSubType == 'T' || pSubType == 'E')
            extMark = (pExternalMark / 100) * 60;
        else if (pSubType == 'P' || pSubType == 'C' || pSubType == "J")
            extMark = (pExternalMark / 100) * 50;
    }
    let totalMark = 0;
    if (pSubCode == "HS8381" || pSubCode == "ME6713" || pSubCode == "BA5311" || pSubCode == "19IS1912"
        || pSubCode == "ME8712" || pSubCode == "CE8711" || pSubCode == "CE8712" || pSubCode == "19BA3904"
        || pSubCode == "19IS3912" || pSubCode == "19IT3AP1" || pSubCode == "19IT1L01" || pSubCode == "20CA1M01" || pSubCode == '19GE3M01'
    ) {
        totalMark = pExternalMark;
    } else
        totalMark = Math.round(extMark + pInternalMark);
    return totalMark;
}

module.exports.CalculateExternalMark1 = (pRegulation, pSubType, pExternalMark) => {
    /**
        * R2013 & R2017 => 
        *    SubType => Theory, Practical =>
        *      External - 80
        *      Internal - 20
        * R2019 => 
        *    SubType => Theory, 
        *      External - 60
        *      Internal - 40
        *    SubType => Practical, 
        *      External - 50
        *      Internal - 50
        *    SubType => Theory Come Practical, 
        *      External - 50
        *      Internal - 50 (Theory Test -30(CAT1,CAT2...) , Practical - 20 (exper(10), test(10)) )
        */
    pExternalMark = (pExternalMark < 0) ? 0 : pExternalMark;
    let extMark = pExternalMark;
    if (pRegulation == 'R2013' || pRegulation == 'R2017') {
        extMark = (pExternalMark / 100) * 80;
    } else if (pRegulation == 'R2019' || pRegulation == 'R2020') {
        if (pSubType == 'T' || pSubType == 'E')
            extMark = (pExternalMark / 100) * 60;
        else if (pSubType == 'P' || pSubType == 'C')
            extMark = (pExternalMark / 100) * 50;
        else if (pSubType == "J")
            extMark = pExternalMark; // TODO in Future
    }
    return extMark;
}

module.exports.GetPassMark = (pCourseType) => {
    /** 
        * IF UG => 45 (in external mark) passmark
        * IF PG => 50 (in external mark) passmark
    */
    return (pCourseType == "UG") ? 45 : 50
}

module.exports.IsStudentPass = (pCourseType, pRegulation, pSubType, pExternalMark, pInternalMark, pSubCode) => {
    let strPassMark = this.GetPassMark(pCourseType)
    let blnPass = true;
    if (pExternalMark < strPassMark) {
        blnPass = false;
    }
    else {
        let strTotalMark = this.CalculateExternalMark(pRegulation, pSubType, pExternalMark, pInternalMark, pSubCode)
        if (strTotalMark < 50)
            blnPass = false;
    }
    return blnPass;
}

module.exports.IsStudentPassByGrade = (pGrade) => {
    let blnPass = true;
    if (pGrade == 'RA' || pGrade == 'AB' || pGrade == 'UA' || pGrade == 'U' || pGrade == 'AB' || pGrade == 'W')
        blnPass = false;
    return blnPass;
}

module.exports.PrepareExaminerAnalysisReport = (pResultRows) => {
    let arrUniqueSubjects = pResultRows.map(function (obj) { return obj.subCode });
    arrUniqueSubjects = arrUniqueSubjects.filter((value, index, self) => self.map(x => x).indexOf(value) == index);
    arrUniqueSubjects = ["19GE1201"];
    let lstSubjects = [];
    for (let subIndx = 0; subIndx < arrUniqueSubjects.length; subIndx++) {
        let arrSubject = pResultRows.filter(function (obj) {
            return obj["subCode"] == arrUniqueSubjects[subIndx]
        })

        let arrUniqueCourses = arrSubject.map(function (obj) { return obj.courseId });
        arrUniqueCourses = arrUniqueCourses.filter((value, index, self) => self.map(x => x).indexOf(value) == index);

        let lstCourses = [];
        for (let courseIndx = 0; courseIndx < arrUniqueCourses.length; courseIndx++) {
            let strTotalExternalMark = 0, strTotalExternalSctript = 0, strTotalInternalMark = 0, strTotalStudents = 0, strTotalAppeared = 0;
            let arrCourse = arrSubject.filter(function (obj) {
                return obj["courseId"] == arrUniqueCourses[courseIndx]
            })

            let arrAbsentList = arrCourse.filter(function (obj) {
                return obj["intMark"] == "-1";
            })

            // To get externals detail
            let arrExternals = arrCourse.map(function (obj) {
                return { "examinerName": obj.examinerName, "examinerBoard": obj.examinerBoard, "examinerCollege": obj.examinerCollege, "examinerDept": obj.examinerDept };
            }).filter((value, index, self) => self.map(x => x.examinerName).indexOf(value.examinerName) == index)

            let lstExternals = [];
            for (let examinerIndx = 0; examinerIndx < arrExternals.length; examinerIndx++) {
                let lstExaminer = arrCourse.filter(obj => { return obj["examinerName"] == arrExternals[examinerIndx]["examinerName"] })
                let strExternalMark = 0;
                for (let mrkIndx = 0; mrkIndx < lstExaminer.length; mrkIndx++) {
                    strExternalMark = strExternalMark + lstExaminer[mrkIndx]["extMark"]
                }
                strTotalExternalMark = strTotalExternalMark + strExternalMark;
                strTotalExternalSctript = strTotalExternalSctript + lstExaminer.length;

                lstExternals.push({
                    "externalName": ((arrExternals[examinerIndx]["examinerName"] == null || arrExternals[examinerIndx]["examinerName"] == '') ? '-' : arrExternals[examinerIndx]["examinerName"]),
                    "externalCollege": ((arrExternals[examinerIndx]["examinerCollege"] == null || arrExternals[examinerIndx]["examinerCollege"] == '') ? '-' : arrExternals[examinerIndx]["examinerCollege"]),
                    "externalDept": ((arrExternals[examinerIndx]["examinerDept"] == null || arrExternals[examinerIndx]["examinerDept"] == '') ? '-' : arrExternals[examinerIndx]["examinerDept"]),
                    "externalBoard": ((arrExternals[examinerIndx]["examinerBoard"] == null || arrExternals[examinerIndx]["examinerBoard"] == '') ? '-' : arrExternals[examinerIndx]["examinerBoard"]),
                    "noOfScript": lstExaminer.length,
                    "externalAvg": Math.round(strExternalMark / lstExaminer.length)
                })
            }

            // To get internals detail
            let arrInternals = arrCourse.map(function (obj) {
                return { "course": obj.course, "internalName": obj.inetnalStaffName, "section": obj.section, "intMark": obj.intMark };
            }).filter((value, index, self) => self.map(x => x.internalName).indexOf(value.internalName) == index)

            let lstInternals = [];
            for (let intrnlIndx = 0; intrnlIndx < arrInternals.length; intrnlIndx++) {
                let lstInternalExaminer = arrCourse.filter(obj => {
                    return obj["inetnalStaffName"] == arrInternals[intrnlIndx]["internalName"]
                })
                let arrPresentList = lstInternalExaminer.filter(function (obj) {
                    return obj["intMark"] != "-1"
                })

                let strInternalMark = 0;
                for (let mrkIndx = 0; mrkIndx < arrPresentList.length; mrkIndx++) {
                    strInternalMark = strInternalMark + arrPresentList[mrkIndx]["intMark"]
                }

                strTotalInternalMark = strTotalInternalMark + strInternalMark;
                strTotalStudents = strTotalStudents + lstInternalExaminer.length;
                strTotalAppeared = strTotalAppeared + arrPresentList.length;

                lstInternals.push({
                    "internalName": arrInternals[intrnlIndx]["internalName"],
                    "course": arrCourse[0]["course"],
                    "batch": arrInternals[intrnlIndx]["batch"],
                    "section": arrInternals[intrnlIndx]["section"],
                    "noOfStudents": lstInternalExaminer.length,
                    "noOfStuAppeard": arrPresentList.length,
                    "internalAvg": Math.round(strInternalMark / (arrPresentList.length))
                })
            }

            lstCourses.push({
                "courseId": arrUniqueCourses[courseIndx],
                "courseName": arrCourse[0]["course"],
                "noOfStudents": arrCourse.length,
                "noOfStuAppeard": arrCourse.length - arrAbsentList.length,
                "internalAvg": Math.round(strTotalInternalMark / strTotalAppeared),
                "externalAvg": Math.round(strTotalExternalMark / strTotalExternalSctript),
                "external": lstExternals,
                "internal": lstInternals
            });
        }

        lstSubjects.push({ "subCode": arrSubject[0]["subCode"], "subName": arrSubject[0]["subName"], "courseList": lstCourses })
    }
    return lstSubjects;
}

module.exports.PrepareGraduationStudentList = (pRows) => {
    let lstStudents = [];
    if (pRows[0].length > 0) {

        let arrUniqueStu = pRows[0].map(function (obj) { return { "registerNo": obj.registerNo, "studentName": obj.studentName, "regulation": obj.regulation, "deptCode": obj.deptCode, "degree": obj.degree, "branch": obj.branch }; });
        arrUniqueStu = arrUniqueStu.filter((value, index, self) => self.map(x => x.registerNo).indexOf(value.registerNo) == index).sort();

        let strRegulation = arrUniqueStu[0]["regulation"];

        for (let j = 0; j < arrUniqueStu.length; j++) {
            // calculate for all semester
            let strEarnedCredits = 0, strTotalCredits = 0;

            let lstStudent = pRows[0].filter(function (obj) {
                return obj.registerNo == arrUniqueStu[j]["registerNo"]
            })

            let arrCheckArrearSub = lstStudent.filter(obj => { return (obj.grade == 'RA' || obj.grade == 'UA' || obj.grade == 'U' || obj.grade == 'AB') });

            // should skip arrear student for consolidated mark sheet
            if (arrCheckArrearSub.length == 0) {

                // let arrUniqueSemester = lstStudent.map(function (obj) { return obj.semester });
                // arrUniqueSemester = arrUniqueSemester.filter((value, index, self) => self.map(x => x).indexOf(value) == index).sort();

                for (let mrkIndx = 0; mrkIndx < lstStudent.length; mrkIndx++) {
                    strEarnedCredits = strEarnedCredits + (lstStudent[mrkIndx]["earnedCredit"] * lstStudent[mrkIndx]["subCredit"]);
                    strTotalCredits = strTotalCredits + lstStudent[mrkIndx]["subCredit"]
                }

                // To find arrear history
                let lstArrearHistory = pRows[1].filter(function (obj) {
                    return obj.registerNo == arrUniqueStu[j]["registerNo"]
                })
                let blnArrear = false;
                if (lstArrearHistory.length > 0)
                    blnArrear = true;

                // To calculate overall CGPA
                let strCGPA = parseFloat(strEarnedCredits / strTotalCredits).toFixed(3);
                let strClassification = __GetClassification(strRegulation, strCGPA, blnArrear)

                lstStudents.push({
                    "registerNo": lstStudent[0]['registerNo'],
                    "studentName": lstStudent[0]['studentName'],
                    "degree": lstStudent[0]['degree'],
                    "branch": lstStudent[0]['branch'],
                    "regulation": lstStudent[0]['regulation'],
                    "attempt": ((blnArrear) ? 'Yes' : 'No'),
                    "CGPA": strCGPA,
                    "classification": strClassification,
                    "stuPhotoUrl": lstStudent[0]["encUrl"]
                });
            }
        }
    }
    return lstStudents;
}

module.exports.PrepareListFailedByInternal = (pResultRows) => {
    let lstCourse = [];
    if (pResultRows.length > 0) {

        let arrDeptList = pResultRows.map(item => item.deptAcr).filter((value, index, self) => self.indexOf(value) === index)

        for (let deptIndex = 0; deptIndex < arrDeptList.length; deptIndex++) {

            // get all dept list
            let arrDept = pResultRows.filter(function (item1, pos1) {
                return item1.deptAcr == arrDeptList[deptIndex];
            });

            let arrCourseList = arrDept.map(function (obj) { return { "courseAcr": obj.courseAcr, "course": obj.course, "courseType": obj.courseType, "courseObj": (obj.course + '-' + obj.courseAcr) }; });
            arrCourseList = arrCourseList.filter((value, index, self) => self.map(x => x.courseObj).indexOf(value.courseObj) == index)

            for (let courseIndex = 0; courseIndex < arrCourseList.length; courseIndex++) {
                let lstBatchs = [];

                // get all course list
                let arrCourse = arrDept.filter(function (item1, pos1) {
                    return item1.courseAcr == arrCourseList[courseIndex]['courseAcr'] && item1.course == arrCourseList[courseIndex]['course'];
                });

                // get unique batch list

                let arrBatchList = arrCourse.map(item => item.batch).filter((value, index, self) => self.indexOf(value) === index)
                for (let batchIndex = 0; batchIndex < arrBatchList.length; batchIndex++) {

                    // get all batch list
                    let arrBatch = arrCourse.filter(function (item1, pos1) {
                        return item1.batch == arrBatchList[batchIndex];
                    });

                    let arrSectionList = arrBatch.map(item => item.section).filter((value, index, self) => self.indexOf(value) === index)

                    for (let secIndx = 0; secIndx < arrSectionList.length; secIndx++) {

                        // get all batch list
                        let arrSection = arrBatch.filter(function (item1, pos1) {
                            return item1.section == arrSectionList[secIndx];
                        });
                        // get subject list
                        let arrSubjectList = arrSection.map(item => item.subCode).filter((value, index, self) => self.indexOf(value) === index)
                        let lstSubjects = []
                        for (let subIndx = 0; subIndx < arrSubjectList.length; subIndx++) {

                            // get all student list
                            let arrStudents = arrSection.filter(function (item1, pos1) {
                                return item1.subCode == arrSubjectList[subIndx];
                            });
                            let lstStudents = [];
                            for (let index = 0; index < arrStudents.length; index++) {

                                let tmpMark = arrStudents[index]['extMark'] + parseInt(arrStudents[index]['boostMark']);

                                // check either student failed by internal on this subject
                                let blnFailedByInternal = this.IsFailedByInternal(arrCourse[0]['courseType'], arrStudents[index]['regulation'], arrStudents[index]['subType'], tmpMark, arrStudents[index]['intMark'], arrStudents[index]['subCode']);
                                if (blnFailedByInternal)
                                    lstStudents.push({ "registerNo": arrStudents[index]['registerNo'], "stuName": arrStudents[index]['stuName'], "extMark": tmpMark, "intMark": arrStudents[index]['intMark'] })
                            }
                            if (lstStudents.length > 0) {
                                lstSubjects.push({
                                    "subCode": arrStudents[0]['subCode'],
                                    "subName": arrStudents[0]['subName'],
                                    "handledBy": arrStudents[0]['handledBy'],
                                    "stuTotal": lstStudents.length,
                                    "studentList": lstStudents
                                })
                            }
                        }
                        if (lstSubjects.length > 0)
                            lstBatchs.push({
                                "batch": arrBatchList[batchIndex] + "-" + arrSectionList[secIndx],
                                "subjectList": lstSubjects
                            })
                    }
                }
                if (lstBatchs.length > 0)
                    lstCourse.push({
                        "courseName": arrCourseList[courseIndex]['course'] + "-" + arrCourseList[courseIndex]['courseAcr'],
                        "batchList": lstBatchs
                    });
            }
        }
    }
    return lstCourse;
}

module.exports.IsFailedByInternal = (pCourseType, pRegulation, pSubType, pExternalMark, pInternalMark, pSubCode) => {
    let strPassMark = this.GetPassMark(pCourseType)
    let blnFail = false;
    if (pExternalMark >= strPassMark) {
        let strTotalMark = this.CalculateExternalMark(pRegulation, pSubType, pExternalMark, pInternalMark, pSubCode)
        if (strTotalMark < 50)
            blnFail = true;
    }
    return blnFail;
}
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////REVALUATION//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

module.exports.PrepareRevaluationType = (pRows) => {
    let objResult = {}
    if (pRows.length > 0) {
        let blnUpdated = false;

        let lstSubjects = pRows.filter(function (obj) {
            return obj.revalType != null
        })

        if (lstSubjects.length == 0) {
            lstSubjects = pRows
        } else {
            blnUpdated = true;
        }

        let arrSubList = lstSubjects.map(function (obj) {
            return {
                "subCode": obj.subCode,
                "subName": obj.subName,
                "subAcr": obj.subAcr,
                "subType": obj.subType,
                "dummyNo": obj.dummyNo,
                "testID": obj.testID,
                "revalType": obj.revalType
            };
        });
        objResult = {
            "registerNo": lstSubjects[0]['registerNo'],
            "studentName": lstSubjects[0]['studentName'],
            "blnUpdated": blnUpdated,
            "subjectList": arrSubList
        }
    }
    return objResult;
}

module.exports.PrepareRevaluationHistory = (pRows) => {
    let lstStudent = [];
    if (pRows.length > 0) {

        let arrCourseList = pRows.map(function (obj) { return { "courseAcr": obj.courseAcr, "course": obj.course, "courseType": obj.courseType, "courseObj": (obj.course + '-' + obj.courseAcr) }; });
        arrCourseList = arrCourseList.filter((value, index, self) => self.map(x => x.courseObj).indexOf(value.courseObj) == index)

        for (let courseIndex = 0; courseIndex < arrCourseList.length; courseIndex++) {

            // get all course list
            let arrCourse = pRows.filter(function (item1, pos1) {
                return item1.courseAcr == arrCourseList[courseIndex]['courseAcr'] && item1.course == arrCourseList[courseIndex]['course'];
            });

            let arrStudList = arrCourse.map(function (obj) { return obj.registerNo });
            arrStudList = arrStudList.filter((value, index, self) => self.map(x => x).indexOf(value) == index).sort();

            for (let stuIndx = 0; stuIndx < arrStudList.length; stuIndx++) {

                // get student
                let arrStudent = arrCourse.filter(function (item1, pos1) {
                    return item1.registerNo == arrStudList[stuIndx];
                });

                // get all subject list
                let arrSubjects = arrStudent.map(function (obj) { return { "subCode": obj.subCode, "subName": obj.subName, "subAcr": obj.subAcr, "dummyNo": obj.dummyNo, "revalType": obj.revalType }; });

                lstStudent.push({
                    "registerNo": arrStudList[stuIndx],
                    "stuName": arrStudent[0]['stuName'],
                    "examName": arrStudent[0]['testAcr'],
                    "deptCode": arrStudent[0]['deptCode'],
                    "deptName": arrStudent[0]['deptName'],
                    "deptAcr": arrStudent[0]['deptAcr'],
                    "course": arrStudent[0]['course'],
                    "courseAcr": arrStudent[0]['courseAcr'],
                    "batch": arrStudent[0]['batch'],
                    "subjectList": arrSubjects
                })
            }
        }
    }
    return lstStudent;
}

module.exports.GetRevaluationEligibleStudents = (pRows) => {
    let lstStudents = [];
    if (pRows.length > 0) {
        // to find maximum revaluation no
        let maxRevalNo = pRows.reduce(function (prev, current) {
            return (prev.revalNo > current.revalNo) ? prev : current
        });

        let lstRevalStu = pRows.filter(function (obj) {
            return obj['revalNo'] == maxRevalNo['revalNo']
        }).map(function (item) { return item; })

        for (let i = 0; i < lstRevalStu.length; i++) {
            let lstStudent = pRows.filter(function (obj) {
                return obj['registerNo'] == lstRevalStu[i]['registerNo']
            });


            let lstMarks = [lstStudent[0]['actMark']]
            lstMarks = lstMarks.concat(lstStudent.map(function (item) { return item.revalMark; }))

            let blnEligible = true;
            if (maxRevalNo['revalNo'] > 0) {
                // Compare mark and find difference
                for (let j = 0; j < lstMarks.length - 1; j++) {
                    for (let k = j + 1; k < lstMarks.length; k++) {
                        if (Math.abs(lstMarks[j] - lstMarks[k]) < 15) {
                            blnEligible = false;
                            break;
                        }
                    }
                    if (!blnEligible)
                        break;
                }
            }

            if (blnEligible) { // if eligible for next level revaluation
                {
                    lstRevalStu[i]['revalMark'] = null;
                    lstStudents.push(lstRevalStu[i])
                }
            }
        }
    }
    return lstStudents;
}

module.exports.PreparePutRevaluationMark = (pRows) => {
    let objResult = {}
    if (pRows.length > 0) {

        let arrStudents = pRows.map(function (obj) {
            return {
                "registerNo": obj.registerNo,
                "dummyNo": obj.dummyNo,
                "packetNo": obj.packetNo,
                "revalType": obj.revalType,
                "revalNo": obj.revalNo,
                "revalMark": obj.revalMark
            };
        });

        objResult = {
            "examName": pRows[0]['examName'],
            "subCode": pRows[0]['subCode'],
            "subName": pRows[0]['subName'],
            "qpCode": pRows[0]['qpCode'],
            "regulation": pRows[0]['regulation'],
            "studentList": arrStudents,
            "externalInfo": {
                "examinerName": pRows[0]['examinerName'],
                "examinerDept": pRows[0]['examinerDept'],
                "examinerDesig": pRows[0]['examinerDesig'],
                "examinerCollege": pRows[0]['examinerCollege'],
                "assistantExaminerId": pRows[0]['assistantExaminerId'],
                "asistExaminerDesig": pRows[0]['asistExaminerDesig'],
                "assistExaminerDept": pRows[0]['assistExaminerDept'],
                "assistExaminerCollege": pRows[0]['assistExaminerCollege'],
                "valDate": moment(pRows[0]['valDate']).format('YYYY-MM-DD'),
                "valSession": pRows[0]['valSession']
            },
        }
    }
    return objResult;
}

module.exports.PrepareRevaluationMarkDifferenceReport = (pInputParam, pRows) => {
    let objResult = {};
    let lstStudents = [];
    let lstRevalEligibleStu = [];
    if (pRows.length > 0) {
        objResult = {
            "examName": pRows[0]['examName'],
            "regulation": pRows[0]['regulation'],
            "subCode": pRows[0]['subCode'],
            "subName": pRows[0]['subName'],
            "packetNo": pRows[0]['packetNo'],
            "revalNo": pInputParam['revalNo']
        }

        let lstRevalStu = pRows.filter(function (obj) {
            return obj['revalNo'] == pInputParam['revalNo']
        }).map(function (item) { return item; })

        for (let i = 0; i < lstRevalStu.length; i++) {
            let lstStudent = pRows.filter(function (obj) {
                return obj['registerNo'] == lstRevalStu[i]['registerNo']
            });

            // to get all mark such as actualMark, reval1, reval2, reval3....
            let lstMarks = [{ "key": "M", "value": lstStudent[0]['actMark'] }]
            lstMarks = lstMarks.concat(lstStudent.map(function (item) { return { "key": "R" + item.revalNo.toString(), "value": item.revalMark }; }))

            let objStudent = {
                "Dept": lstStudent[0]['deptAcr'],
                "Dummy Number": lstStudent[0]['dummyNo'],
                "Register Number": lstStudent[0]['registerNo'],
            }

            let blnEligible = true
            // Compare mark and find difference
            let objDiff = {}
            for (let j = 0; j < lstMarks.length - 1; j++) {
                objStudent[lstMarks[j]['key']] = lstMarks[j]['value']

                if (lstMarks.length - 2 == j)
                    objStudent[lstMarks[lstMarks.length - 1]['key']] = lstMarks[lstMarks.length - 1]['value']

                for (let k = j + 1; k < lstMarks.length; k++) {
                    let strDiffKey = 'Difference (' + lstMarks[j]['key'] + '-' + lstMarks[k]['key'] + ')'
                    let diffMark = Math.abs(lstMarks[j]['value'] - lstMarks[k]['value']);
                    objDiff[strDiffKey] = diffMark;

                    if (diffMark < 15) {
                        blnEligible = false;
                    }
                }
            }
            objStudent = { ...objStudent, ...objDiff }

            if (blnEligible) { // if eligible for next level revaluation
                objStudent['blnEligible'] = blnEligible;
                lstRevalEligibleStu.push({ "dummyNo": lstStudent[0]['dummyNo'], "packetNo": lstStudent[0]['packetNo'] })
            }

            // prepare examiner info
            for (let i = 0; i < lstStudent.length; i++) {
                objStudent["Examiner (R" + lstStudent[i]['revalNo'] + ")"] = lstStudent[i]['examinerName']
            }
            lstStudents.push(objStudent);
        }

        if (pInputParam['revalNo'] == 1) {
            // To Sort by dummyNo 
            lstStudents.sort(function (a, b) {
                return b['Difference (M-R1)'] - a['Difference (M-R1)']
            })
        }

        objResult['studentList'] = lstStudents
        objResult['dummyNoList'] = lstRevalEligibleStu
    }
    return objResult;
}

module.exports.PrepareYOPStudents = (pResultRows) => {
    let objResult = {};

    if (pResultRows[0].length > 0) {
        let arrStudents = [];
        let arrRegNoList = pResultRows[0].map(item => item.registerNo).filter((value, index, self) => self.indexOf(value) === index)

        for (let i = 0; i < arrRegNoList.length; i++) {
            let lstStudent = pResultRows[0].filter(function (stu) {
                return stu['registerNo'] == arrRegNoList[i];
            })

            let arrSemesterList = lstStudent.map(item => item.semester).filter((value, index, self) => self.indexOf(value) === index)

            let arrYOP = lstStudent.filter(function (obj) { return obj.isActive == null });
            let strYOPUpdated = 1; // updated all 
            if (arrYOP.length > 0)
                strYOPUpdated = 0; // not updated all

            __UpdateEarnedCredit(pResultRows[3], lstStudent);

            let arrSemester = [];
            for (let j = 0; j < arrSemesterList.length; j++) {

                let lstSemester = lstStudent.filter(function (sem) {
                    return sem['semester'] == arrSemesterList[j] && (sem['grade'] != 'U' && sem['grade'] != 'RA' && sem['grade'] != 'UA' && sem['grade'] != 'AB');
                }).map(function (obj) {
                    return {
                        "subCode": obj.subCode,
                        "subName": obj.subName,
                        "grade": obj.grade,
                        "earnedCredit": obj.earnedCredit,
                        "YOP": obj.monthYear,
                        "masterTestId": obj.masterTestId,
                        "revalType": obj.revalType,
                        "coeYOP": (obj.coeYOP != null) ? obj.coeYOP : obj.masterTestId,
                        "blnUpdated": (obj.coeYOP != null) ? obj.coeYOP : obj.isActive
                    };
                });
                arrSemester.push({
                    "semester": arrSemesterList[j].padStart(2, '0'),
                    "subjectList": lstSemester
                })

            }
            let arrYOPVerification = (pResultRows[1] != undefined) ? pResultRows[1].filter(function (obj) { return obj.regNo == lstStudent[0]['registerNo'] }) : [];
            arrStudents.push({
                "regNo": lstStudent[0]['registerNo'],
                "stuName": lstStudent[0]['studentName'],
                "verifyCount": (arrYOPVerification.length == 0) ? 0 : arrYOPVerification[0]['verCount'],
                "semesterList": arrSemester
            })
        }

        let arrExams = (pResultRows[2] != undefined) ? pResultRows[2].filter(function (obj) { return obj.regulation == pResultRows[0][0]['regulation'] }) : [];
        objResult = {
            "blnShowYOP": false,
            "Exams": arrExams,
            "studentList": arrStudents
        }
    }
    return objResult;
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////// STUDENT COE/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

module.exports.PrepareStudentUnivTimetable = (pRows) => {
    let objResult = {};
    if (pRows.length > 0) {
        // To find maximum semester of student
        let maxSemester = pRows.reduce(function (prev, current) {
            return (prev.semester > current.semester) ? prev : current
        });
        let arrSemCourse = pRows.map(function (obj) {
            return { "subCode": obj.subCode, "subName": obj.subName, "subType": obj.subType, "semester": obj.semester, "examDate": moment(obj.examDate).format("YYYY-MM-DD"), "examSession": obj.examSession };
        })

        objResult = {
            "blnShowTT": false,
            "examName": pRows[0]['examName'],
            "registerNo": pRows[0]['registerNo'],
            "studentName": pRows[0]['studentName'],
            "regulation": pRows[0]['regulation'],
            "curSemester": maxSemester['semester'],
            "SemSubjects": arrSemCourse
        }
    }
    return objResult;
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////END OF STUDENT COE///////////////////////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// module.exports.PrepareMarkSheetInfo = (pRows) => {
//     let objResult = {}
//     let strCourseType = 'UG';
//     if (pRows[1].length > 0) {
//         strCourseType = pRows[1][0]['courseType'].toUpperCase()
//         objResult = {
//             "college": pRows[1][0]['clgName'],
//             "regulation": pRows[1][0]['regulation'],
//             "programme": pRows[1][0]['courseDegree'],
//             "branch": pRows[1][0]['courseName'],
//             "batch": pRows[1][0]['batchYear']
//         }
//     }
//     let lstStudents = [];
//     if (pRows[0].length > 0) {

//         // To filter currently written university exam papers including arrear paper
//         let lstCurSubjects = pRows[0].filter(function (obj) { return obj["examStatus"] == 1 });

//         // To find maximum semester of student
//         let maxSemester = lstCurSubjects.reduce(function (prev, current) {
//             return (prev.semester > current.semester) ? prev : current
//         });

//         // To prepare grade sheet for current attempted papers only
//         let arrUniqueStu = lstCurSubjects.map(function (obj) { return obj.registerNo });
//         arrUniqueStu = arrUniqueStu.filter((value, index, self) => self.map(x => x).indexOf(value) == index).sort();
//         for (let j = 0; j < arrUniqueStu.length; j++) {
//             let lstStudent = lstCurSubjects.filter(function (obj) {
//                 return obj.registerNo == arrUniqueStu[j]
//             })
//             let blnAllPass = true, strTotalSubCredit = 0, strTotalEarnedCredit = 0;

//             let lstMarkData = lstStudent.map(obj => {
//                 let strPass = this.IsStudentPass(strCourseType, obj.regulation, obj.subType, obj.extMark, obj.intMark, obj.courseCode);

//                 if (!strPass) { blnAllPass = false; }
//                 else {
//                     // calculate GPA for current semester only and skip arrear subjects if any
//                     if (maxSemester["semester"] == obj["semester"]) {
//                         strTotalSubCredit = strTotalSubCredit + obj.subCredit;
//                         strTotalEarnedCredit = strTotalEarnedCredit + (obj.earnedCredit * obj.subCredit);
//                     }
//                 }

//                 return {
//                     "semester": obj.semester.padStart(2, '0'),
//                     "courseCode": obj.courseCode,
//                     "courseTitle": obj.courseTitle,
//                     "credit": obj.subCredit,
//                     "letterGrade": obj.grade,
//                     "gradePoint": obj.earnedCredit,
//                     "result": (strPass) ? 'P' : 'RA'
//                 }
//             })

//             // calculate CGPA if all subjects are passed
//             let strCGPA = "-";
//             if (blnAllPass) {
//                 let lstAllSem = pRows[0].filter(function (obj) { return obj["registerNo"] == arrUniqueStu[j] && obj["grade"] != "RA" && obj["grade"] != "UA" && obj["grade"] != "U" && obj["grade"] != "AB" });
//                 strCGPA = __CalculateCGPA(lstAllSem)["CGPA"];
//             }

//             let strGPA = isNaN(strTotalEarnedCredit / strTotalSubCredit) ? 0 : (strTotalEarnedCredit / strTotalSubCredit);

//             lstStudents.push({
//                 "regNo": lstStudent[0]['registerNo'],
//                 "stuName": lstStudent[0]['studentName'],
//                 "dob": moment(lstStudent[0]['stuDOB']).format('DD-MMM-YYYY'),
//                 "examMonthYear": lstStudent[0]['monthYear'],
//                 "regulation": lstStudent[0]['regulation'],
//                 "dop": "04-FEB-17",
//                 "gender": lstStudent[0]['stuGender'],
//                 "sno": "123456789",
//                 "folioNo": "987654321",
//                 "stuImg": lstStudent[0]['encUrl'],
//                 "GPA": parseFloat(strGPA).toFixed(3),
//                 "CGPA": strCGPA,
//                 "subList": lstMarkData,
//                 "totalEarnedCredit": strTotalEarnedCredit
//             })
//         }
//         objResult['stuList'] = lstStudents
//         objResult['gradeList'] = pRows[2]
//     }
//     return objResult;
// }

module.exports.PrepareConsolidatedMarkSheet = (pRows) => {
    let objResult = {};
    if (pRows[0].length > 0) {

        let arrUniqueStu = pRows[0].map(function (obj) { return { "registerNo": obj.registerNo, "regulation": obj.regulation, "regulation2": obj.regulation2, "deptCode": obj.deptCode, "degree": obj.degree, "branch": obj.branch }; });
        arrUniqueStu = arrUniqueStu.filter((value, index, self) => self.map(x => x.registerNo).indexOf(value.registerNo) == index).sort();

        let lstStudents = [];
        for (let j = 0; j < arrUniqueStu.length; j++) {
            // calculate for all semester
            let strEarnedCredits = 0, strTotalCredits = 0;

            let lstStudent = pRows[0].filter(function (obj) {
                return obj.registerNo == arrUniqueStu[j]["registerNo"]
            })

            let arrCheckArrearSub = lstStudent.filter(obj => { return (obj.grade == 'RA' || obj.grade == 'UA' || obj.grade == 'U' || obj.grade == 'AB') });

            // should skip arrear student for consolidated mark sheet
            if (arrCheckArrearSub.length == 0) {

                // let arrUniqueSemester = lstStudent.map(function (obj) { return obj.semester });
                // arrUniqueSemester = arrUniqueSemester.filter((value, index, self) => self.map(x => x).indexOf(value) == index).sort();

                for (let mrkIndx = 0; mrkIndx < lstStudent.length; mrkIndx++) {
                    strEarnedCredits = strEarnedCredits + (lstStudent[mrkIndx]["earnedCredit"] * lstStudent[mrkIndx]["subCredit"]);
                    strTotalCredits = strTotalCredits + lstStudent[mrkIndx]["subCredit"]
                }

                let strLastAppearence = '';
                let lstMarkData = lstStudent.map(obj => {
                    // To check max of exam date is the last appearence for student
                    strLastAppearence = (strLastAppearence == '') ? moment(obj.monthYear) : strLastAppearence;
                    if (obj.monthYear != null && moment(obj.monthYear) > moment(strLastAppearence))
                        strLastAppearence = moment(obj.monthYear);
                    // let lstMarkData = lstStudent.map(obj => {
                    //     // To check max of exam date is the last appearence for student
                    //     let curMonthYear = (obj.monthYear != null) ? moment(obj.monthYear) : '';
                    //     if (obj.monthYear != null && moment(curMonthYear) > moment(obj.monthYear))
                    //         strLastAppearence = moment(obj.monthYear);


                    return {
                        "semester": obj.semester.padStart(2, '0'),
                        "courseCode": obj.subCode,
                        "courseTitle": obj.subName,
                        "subCredit": obj.subCredit,
                        "letterGrade": obj.grade,
                        "gradePoint": obj.earnedCredit,
                        "monthYear": obj.monthYear
                    }
                })

                let lstCertLog = pRows[1].filter(obj => { return obj.registerNo == arrUniqueStu[j]["registerNo"] });
                let strCertLogCount = 0;

                if (lstCertLog.length > 0) {
                    strCertLogCount = lstCertLog[0]['certLogCount']
                }

                // To find arrear history
                let lstArrearHistory = pRows[2].filter(function (obj) {
                    return obj.registerNo == arrUniqueStu[j]["registerNo"]
                })
                let blnArrear = false;
                if (lstArrearHistory.length > 0)
                    blnArrear = true;

                // To calculate overall CGPA
                // let strCGPA = parseFloat(strEarnedCredits / strTotalCredits).toFixed(2);
                let strCGPA = parseFloat((lstStudent[0]['CGPA'] != null && lstStudent[0]['CGPA'] != '') ? lstStudent[0]['CGPA'] : 0).toFixed(2);
                let strClassification = __GetClassification(arrUniqueStu[j]["regulation"], strCGPA, blnArrear)

                // To generate FolioNo
                let strBatch = lstStudent[0]["batch"].substring(2, 4);
                let strRegNo = lstStudent[0]["registerNo"].substring(lstStudent[0]["registerNo"].length - 3, lstStudent[0]["registerNo"].length);
                let strFolioNo = strBatch + lstStudent[0]["courseCode"] + strRegNo;

                lstStudents.push({
                    "regNo": lstStudent[0]['registerNo'],
                    "stuName": lstStudent[0]['studentName'],
                    "dob": moment(lstStudent[0]['stuDOB']).format("DD-MMM-YYYY"),
                    "gender": (lstStudent[0]['stuGender'] == 'M' ? 'MALE' : 'FEMALE'),
                    "folioNo": strFolioNo,
                    // "lastAppearence": strLastAppearence,
                    "stuImg": lstStudent[0]['encUrl'],
                    "CGPA": strCGPA,
                    "totalEarnedCredit": lstStudent[0]['totalEarnedCredit'],
                    "classification": strClassification,
                    "subList": lstMarkData,
                    "certLogCount": strCertLogCount,
                    // "dateOfPrint": (lstStudent[0]['dateOfPrint'] != null && lstStudent[0]['dateOfPrint'] != '') ? moment(lstStudent[0]['dateOfPrint']).format("DD-MMM-YYYY") : '',
                    "lastAppearence": strLastAppearence.format("MMM YYYY"),
                    "dateOfPrint": moment('2020-12-02').format("DD-MMM-YYYY")
                });
            }
        }
        objResult = {
            "regulation": arrUniqueStu[0]['regulation'],
            "regulation2": arrUniqueStu[0]['regulation2'],
            "deptCode": arrUniqueStu[0]['deptCode'],
            "degree": arrUniqueStu[0]['degree'],
            "branch": arrUniqueStu[0]['branch'],
            "stuList": lstStudents
        }
        return objResult;
    };
}

function __GetClassification(pRegulation, pCGPA, pArrearHistory) {
    let strClassification = '';
    pCGPA = Number(pCGPA);
    if (pRegulation.toUpperCase() == 'R2013' || pRegulation.toUpperCase() == '2013') {
        if (!pArrearHistory && pCGPA >= 8.5)
            strClassification = "FIRST CLASS WITH DISTINCTION";
        else if (pCGPA >= 6.5 && pCGPA < 8.5)
            strClassification = "FIRST CLASS";
        else
            strClassification = "SECOND CLASS";
    } else if (pRegulation.toUpperCase() == 'R2017' || pRegulation.toUpperCase() == '2013') {
        if (!pArrearHistory && pCGPA >= 8.5)
            strClassification = "FIRST CLASS WITH DISTINCTION";
        else if (pCGPA >= 7.00 && pCGPA < 8.5)
            strClassification = "FIRST CLASS";
        else
            strClassification = "SECOND CLASS";
    }
    return strClassification;
}

module.exports.PrepareMarkSheetInfo = (pRows) => {
    let objResult = {}
    let strCourseType = 'UG';
    if (pRows[1].length > 0) {
        strCourseType = pRows[1][0]['courseType'].toUpperCase()
        objResult = {
            "college": pRows[1][0]['clgName'],
            "regulation": pRows[1][0]['regulation'],
            "programme": pRows[1][0]['courseDegree'],
            "branch": pRows[1][0]['courseName'],
            "batch": pRows[1][0]['batchYear']
        }
    }
    let lstStudents = [];
    if (pRows[0].length > 0) {

        // To filter currently written university exam papers including arrear paper
        // let lstCurSubjects = pRows[0].filter(function (obj) { return obj["examStatus"] == 1 });

        // To find maximum semester of student
        let maxSemester = pRows[0].reduce(function (prev, current) {
            return (prev.semester > current.semester) ? prev : current
        });

        // To prepare grade sheet for currently attempted papers only
        let arrUniqueStu = pRows[0].map(function (obj) { return obj.registerNo });
        arrUniqueStu = arrUniqueStu.filter((value, index, self) => self.map(x => x).indexOf(value) == index).sort();
        for (let j = 0; j < arrUniqueStu.length; j++) {
            let lstStudent = pRows[0].filter(function (obj) {
                return obj.registerNo == arrUniqueStu[j]
            })
            let blnAllPass = true, strTotalSubCredit = 0, strTotalEarnedCredit = 0, strTotalGP = 0;

            let lstMarkData = lstStudent.map(obj => {
                // let strPass = this.IsStudentPass(strCourseType, obj.regulation, obj.subType, obj.extMark, obj.intMark, obj.courseCode);
                let strPass = this.IsStudentPassByGrade(obj.grade)
                if (!strPass) { blnAllPass = false; }
                else {
                    // calculate GPA for current semester only and skip arrear subjects if any
                    if (maxSemester["semester"] == obj["semester"]) {
                        strTotalSubCredit = strTotalSubCredit + obj.subCredit;
                        strTotalEarnedCredit = strTotalEarnedCredit + (obj.earnedCredit * obj.subCredit);
                        strTotalGP = strTotalGP + parseInt(obj.earnedCredit);
                    }
                }

                return {
                    "semester": obj.semester.padStart(2, '0'),
                    "courseCode": obj.courseCode,
                    "courseTitle": obj.courseTitle,
                    "credit": obj.subCredit,
                    "letterGrade": obj.grade,
                    "gradePoint": obj.earnedCredit,
                    "result": (strPass) ? 'P' : 'RA'
                }
            })

            // calculate CGPA if all subjects are passed
            // let strCGPA = "-";
            // if (blnAllPass) {
            //     let lstAllSem = pRows[0].filter(function (obj) { return obj["registerNo"] == arrUniqueStu[j] && obj["grade"] != "RA" && obj["grade"] != "UA" && obj["grade"] != "U" && obj["grade"] != "AB" });
            //     strCGPA = __CalculateCGPA(lstAllSem)["CGPA"];
            // }

            let strGPA = isNaN(strTotalEarnedCredit / strTotalSubCredit) ? 0 : (strTotalEarnedCredit / strTotalSubCredit);

            lstStudents.push({
                "regNo": lstStudent[0]['registerNo'],
                "stuName": lstStudent[0]['studentName'],
                "dob": moment(lstStudent[0]['stuDOB']).format("DD-MMM-YYYY"),
                "examMonthYear": lstStudent[0]['monthYear'],
                "regulation": lstStudent[0]['regulation'],
                "dop": "04-FEB-17",
                "gender": lstStudent[0]['stuGender'],
                "sno": "123456789",
                "folioNo": "987654321",
                "stuImg": lstStudent[0]['encUrl'],
                "totalEarnedCredit": strTotalGP,
                "GPA": parseFloat(strGPA).toFixed(3),
                "CGPA": lstStudent[0]['CGPA'],
                "subList": lstMarkData
            })
        }
        objResult['stuList'] = lstStudents
        objResult['gradeList'] = pRows[2]
    }
    return objResult;
}

function __CalculateCGPA(pRows) {
    let strTotalSubCredit = 0, strTotalEarnedCredit = 0;
    for (let indx = 0; indx < pRows.length; indx++) {
        strTotalSubCredit = strTotalSubCredit + pRows[indx]["subCredit"];
        strTotalEarnedCredit = strTotalEarnedCredit + (pRows[indx]["subCredit"] * pRows[indx]["earnedCredit"]);
    }
    let strCGPA = isNaN(strTotalEarnedCredit / strTotalSubCredit) ? 0 : (strTotalEarnedCredit / strTotalSubCredit);
    return { "CumulativeCreditsEarned": strTotalSubCredit, "CGPA": parseFloat(strCGPA).toFixed(2) };
}

module.exports.PrepareFinalMarkSheetInfo = (pRows) => {
    let objResult = {}
    let strCourseType = 'UG';
    if (pRows[1].length > 0) {
        strCourseType = pRows[1][0]['courseType'].toUpperCase()
        objResult = {
            "college": pRows[1][0]['clgName'],
            "regulation": pRows[1][0]['regulation'],
            "programme": pRows[1][0]['courseDegree'],
            "branch": pRows[1][0]['courseName'],
            "batch": pRows[1][0]['batchYear']
        }
    }
    let lstStudents = [];
    if (pRows[0].length > 0) {

        // To filter currently written exam subjects including arrear papers
        // let lstCurSubjects = pRows[0].filter(function (obj) { return obj["examStatus"] == 2 });

        // // To find maximum semester of student
        // let maxSemester = lstCurSubjects.reduce(function (prev, current) {
        //     return (prev.semester > current.semester) ? prev : current
        // });

        let arrUniqueStu = pRows[0].map(function (obj) { return obj.registerNo });
        arrUniqueStu = arrUniqueStu.filter((value, index, self) => self.map(x => x).indexOf(value) == index).sort();

        for (let j = 0; j < arrUniqueStu.length; j++) {
            let lstSemester = {
                "I": { "Credits Registered": "", "Credits Earned": "", "Grade Point Earned": "", "Grade Point Average (GPA)": "" },
                "II": { "Credits Registered": "", "Credits Earned": "", "Grade Point Earned": "", "Grade Point Average (GPA)": "" },
                "III": { "Credits Registered": "", "Credits Earned": "", "Grade Point Earned": "", "Grade Point Average (GPA)": "" },
                "IV": { "Credits Registered": "", "Credits Earned": "", "Grade Point Earned": "", "Grade Point Average (GPA)": "" },
                "V": { "Credits Registered": "", "Credits Earned": "", "Grade Point Earned": "", "Grade Point Average (GPA)": "" },
                "VI": { "Credits Registered": "", "Credits Earned": "", "Grade Point Earned": "", "Grade Point Average (GPA)": "" },
                "VII": { "Credits Registered": "", "Credits Earned": "", "Grade Point Earned": "", "Grade Point Average (GPA)": "" },
                "VIII": { "Credits Registered": "", "Credits Earned": "", "Grade Point Earned": "", "Grade Point Average (GPA)": "" },
            }

            let lstStudent = pRows[0].filter(function (obj) {
                return obj.registerNo == arrUniqueStu[j]
            })

            // calculate GPA, CGPA for current semester
            let arrUniqueSemester = lstStudent.map(function (obj) { return obj.semester });
            arrUniqueSemester = arrUniqueSemester.filter((value, index, self) => self.map(x => x).indexOf(value) == index).sort();

            for (let semIndx = 0; semIndx < arrUniqueSemester.length; semIndx++) {
                let strEarnedCredits = 0;
                let strKey = convertRomanian(arrUniqueSemester[semIndx]);
                lstSemester[strKey] = { "Credits Registered": 0, "Credits Earned": 0, "Grade Point Earned": 0, "Grade Point Average (GPA)": 0 }

                let lstMarks = lstStudent.filter(function (obj) {
                    return obj.semester == arrUniqueSemester[semIndx]
                })

                for (let mrkIndx = 0; mrkIndx < lstMarks.length; mrkIndx++) {
                    lstSemester[strKey]["Credits Registered"] = lstSemester[strKey]["Credits Registered"] + lstMarks[mrkIndx]["subCredit"];

                    // if pass grade in current subject then add subCredit to the credits earned
                    if (lstMarks[mrkIndx]["grade"] != "RA" && lstMarks[mrkIndx]["grade"] != "UA" && lstMarks[mrkIndx]["grade"] != "U" && lstMarks[mrkIndx]["grade"] != "AB") {
                        lstSemester[strKey]["Credits Earned"] = lstSemester[strKey]["Credits Earned"] + lstMarks[mrkIndx]["subCredit"];
                        strEarnedCredits = strEarnedCredits + (lstMarks[mrkIndx]["earnedCredit"] * lstMarks[mrkIndx]["subCredit"]);
                    }
                    lstSemester[strKey]["Grade Point Earned"] = lstSemester[strKey]["Grade Point Earned"] + parseInt(lstMarks[mrkIndx]["earnedCredit"]);
                }
                lstSemester[strKey]["Grade Point Average (GPA)"] = parseFloat(isNaN(strEarnedCredits / lstSemester[strKey]["Credits Earned"]) ? 0 : (strEarnedCredits / lstSemester[strKey]["Credits Earned"])).toFixed(3);
            }

            let lstMarkData = lstStudent.map(obj => {
                // let strPass = this.IsStudentPass(strCourseType, obj.regulation, obj.subType, obj.extMark, obj.intMark, obj.courseCode);
                let strPass = this.IsStudentPassByGrade(obj.grade);
                return {
                    "semester": obj.semester.padStart(2, '0'),
                    "courseCode": obj.courseCode,
                    "courseTitle": obj.courseTitle,
                    "credit": obj.subCredit,
                    "letterGrade": obj.grade,
                    "gradePoint": obj.earnedCredit,
                    "result": (strPass) ? 'PASS' : 'RA'
                }
            })


            let lstCertLog = pRows[3].filter(obj => { return obj.registerNo == lstStudent[0]['registerNo'] });
            let strCertLogCount = 0;
            if (lstCertLog.length > 0) {
                strCertLogCount = lstCertLog[0]['certLogCount']
            }

            // To calculate overall CGPA, cumulative credits earned
            // let lstAllSem = pRows[0].filter(function (obj) { return obj["registerNo"] == arrUniqueStu[j] && obj["grade"] != "RA" && obj["grade"] != "UA" && obj["grade"] != "U" && obj["grade"] != "AB" });
            // strCGPA = __CalculateCGPA(lstAllSem);

            // To generate FolioNo
            let strBatch = (pRows[1] && pRows[1][0]) ? pRows[1][0]["batchYear"].substring(2, 4) : "";
            let strRegNo = lstStudent[0]["registerNo"].substring(lstStudent[0]["registerNo"].length - 3, lstStudent[0]["registerNo"].length);
            let strFolioNo = strBatch + ((pRows[1] && pRows[1][0]) ? pRows[1][0]["courseCode"] : "") + strRegNo;

            lstStudents.push({
                "regNo": lstStudent[0]['registerNo'],
                "stuName": lstStudent[0]['studentName'],
                "dob": moment(lstStudent[0]['stuDOB']).format("DD-MMM-YYYY"),
                "examMonthYear": lstStudent[0]['monthYear'],
                "regulation": lstStudent[0]['regulation'],
                "dop": moment(lstStudent[0]['dateOfPublish']).format("DD-MMM-YYYY"),
                "gender": lstStudent[0]['stuGender'],
                "folioNo": strFolioNo,
                "stuImg": lstStudent[0]['encUrl'],
                "subList": lstMarkData,
                "cumulativeCreditsEarned": lstStudent[0]["totalSubCredits"],
                "CGPA": lstStudent[0]["CGPA"],
                "GPA": lstSemester,
                "dateOfPrint": moment(lstStudent[0]['dateOfPrint']).format("DD-MMM-YYYY")
            })
        }
        objResult['stuList'] = lstStudents
        objResult['gradeList'] = pRows[2]
    }
    return objResult;
}

module.exports.convertRomanian = (pRows) => {
    if (pRows < 1) { return ""; }
    if (pRows >= 40) { return "XL" + this.convertRomanian(pRows - 40); }
    if (pRows >= 10) { return "X" + this.convertRomanian(pRows - 10); }
    if (pRows >= 9) { return "IX" + this.convertRomanian(pRows - 9); }
    if (pRows >= 5) { return "V" + this.convertRomanian(pRows - 5); }
    if (pRows >= 4) { return "IV" + this.convertRomanian(pRows - 4); }
    if (pRows >= 1) { return "I" + this.convertRomanian(pRows - 1); }
}

module.exports.PrepareUnivExamFeesCollection = (pResultRows) => {
    let objResult = {};
    if (pResultRows[0].length > 0) {
        let intMarkSheetAmt = 0;
        if (pResultRows[0][0]['curSem'] == pResultRows[1][0]['maxSemester'])
            intMarkSheetAmt = 2000;

        let lstStudents = pResultRows[0].map(obj => { return { "regNo": obj.regNo, "studentName": obj.studentName, "subjectCount": obj.subjectCount, "prjCount": obj.prjCount, "subjectAmount": obj.subjectAmount, "markSheet": (intMarkSheetAmt == 0) ? "-" : intMarkSheetAmt, "totalAmount": obj.subjectAmount + intMarkSheetAmt } })
        objResult = {
            "examName": pResultRows[0][0]['examName'],
            "dept": pResultRows[1][0]['dept'],
            "courseDegree": pResultRows[1][0]['courseDegree'],
            "batch": pResultRows[1][0]['batch'],
            "section": pResultRows[0][0]['section'],
            "curSem": pResultRows[0][0]['curSem'],
            "stuList": lstStudents
        }
    }
    return objResult;
}

module.exports.PrepareGradeAndGradePoint = (pResultRows) => {
    let objResult = {};
    if (pResultRows[0].length > 0) {
        let arrSemesterList = pResultRows[0].map(item => item.semester).filter((value, index, self) => self.indexOf(value) === index)
        let arrSemester = [];
        for (let j = 0; j < arrSemesterList.length; j++) {

            let lstSemester = pResultRows[0].filter(function (sem) {
                return sem['semester'] == arrSemesterList[j] && (sem['grade'] != 'U' && sem['grade'] != 'RA' && sem['grade'] != 'UA' && sem['grade'] != 'AB');
            }).map(function (obj) {
                return {
                    "subCode": obj.subCode,
                    "subName": obj.subName,
                    "grade": obj.grade,
                    "earnedCredit": obj.earnedCredit
                };
            });
            arrSemester.push({
                "semester": arrSemesterList[j].padStart(2, '0'),
                "subjectList": lstSemester
            })

        }
        objResult = {
            "regNo": pResultRows[0]['registerNo'],
            "stuName": pResultRows[0]['studentName'],
            "semesterList": arrSemester,
            "grade": (pResultRows[1]) ? pResultRows[1] : []
        }
    }
    return objResult;
}

module.exports.PrepareExternalMarkCalculationOnetime = (pRows) => {

    let lstPrevExternalMark = [];
    let lstSubjects = [], lstOverAllStatus = [], lstOverallGradeCount = [], arrOverallFailureCount = [];
    let lstSubWisePassPercentage = [];

    let arrStudents = pRows[1].map(function (obj) { return { "registerNo": obj.registerNo, "stuName": obj.stuName, "semester": obj.semester, "regulation": obj.regulation }; });
    arrStudents = arrStudents.filter((value, index, self) => self.map(x => x.registerNo).indexOf(value.registerNo) == index)

    let strRegulation = pRows[5][0]['regulation'];

    for (let subIndx = 0; subIndx < pRows[3].length; subIndx++) {

        let strSubType = pRows[3][subIndx]['subType'];

        let objGrade = {};
        let lstStudents = [];
        let arrSubwiseFailureCount = [];
        let arrSubStudents = [];

        // To prepare the grade object based on regulation
        let lstGrades = pRows[4].filter(function (obj) {
            return obj.regulation == strRegulation
        })
        for (let grdIndx = 0; grdIndx < lstGrades.length; grdIndx++) {
            objGrade[lstGrades[grdIndx]['grade']] = 0
        }

        // arrStudents = [];
        // arrStudents.push({
        //     registerNo: '1911013',
        //     regulation: 'R2019',
        //     semester: '2',
        //     stuName: 'ESSAI ANANTH V'
        // })

        for (let stuIndx = 0; stuIndx < arrStudents.length; stuIndx++) {
            let objStudent = { "Register No": arrStudents[stuIndx]["registerNo"], "Student Name": arrStudents[stuIndx]["stuName"] }

            if (strRegulation == "R2017") {
                if (strSubType == "T") {

                    /** Prev university theory              - 30%
                     *  current Sem IAT sum(max of 2 IAT)   - 70%
                     */

                    // To get previous semester university external mark 
                    let lstPrevUnivMark = pRows[0].filter(obj => { return obj['registerNo'] == arrStudents[stuIndx]['registerNo'] })

                    let tmp = lstPrevExternalMark.filter(obj => { obj.registerNo == arrStudents[stuIndx]['registerNo'] })
                    if (tmp.length > 0) {
                        objStudent["Conversion of Theory Externals - ODD SEM (March / April 2020)"] = tmp[0]['prevMark'];
                    } else {
                        objStudent["Conversion of Theory Externals - ODD SEM (March / April 2020)"] = __GetPrevTheoryExternal(lstPrevUnivMark, lstPrevExternalMark);
                    }

                    // To get current semester IAT mark
                    arrSubStudents = pRows[1].filter(obj => { return obj.subCode == pRows[3][subIndx]["subCode"] })
                    arrSubStudents = arrSubStudents.map(obj => { return obj.registerNo })
                        .filter((value, index, self) => self.indexOf(value) === index)

                    let lstIATMark = pRows[1].filter(obj => { return obj.registerNo == arrStudents[stuIndx]["registerNo"] && obj.subCode == pRows[3][subIndx]["subCode"] })

                    let strTotal = __BestOfTwoIAT(lstIATMark, objStudent)

                    objStudent["Total Of 2 IAT"] = strTotal
                    let str100mark = (strTotal / 2) // calculate average of best two IAT mark as 100 %
                    objStudent["70% of IAT"] = parseFloat((str100mark / 100) * 70).toFixed(2)  // calculate 70 % 
                    objStudent["Total"] = Math.round(parseFloat(objStudent["Conversion of Theory Externals - ODD SEM (March / April 2020)"]['30%']) + parseFloat(objStudent["70% of IAT"]))  // 30%+70%
                    let stuGrade = __GetGrade(pRows[4], objStudent["Total"], arrStudents[stuIndx]["regulation"]);
                    objStudent["Grade"] = stuGrade["grade"];

                    __CountGrade(objGrade, objStudent["Grade"]);
                    lstStudents.push(objStudent);
                    __AddOverallStatus(lstOverAllStatus, arrStudents[stuIndx]['registerNo'], arrStudents[stuIndx]['stuName'], pRows[3][subIndx]['subCode'], pRows[3][subIndx]['subCredit'], objStudent["Total"], stuGrade);
                } else if (strSubType == "E" || strSubType == "J") {
                    // To get current semester IAT mark
                    arrSubStudents = pRows[1].filter(obj => { return obj.subCode == pRows[3][subIndx]["subCode"] })
                    arrSubStudents = arrSubStudents.map(obj => { return obj.registerNo })
                        .filter((value, index, self) => self.indexOf(value) === index)

                    let lstIATMark = pRows[1].filter(obj => { return obj.registerNo == arrStudents[stuIndx]["registerNo"] && obj.subCode == pRows[3][subIndx]["subCode"] })
                    if (lstIATMark.length > 0) {
                        let strTotal = __BestOfTwoIAT(lstIATMark, objStudent)
                        let stuGrade = {};
                        if (strSubType == "E") {
                            objStudent["Total Of 2 IAT"] = strTotal
                            objStudent["100% of IAT"] = Math.round((strTotal / 2)) // calculate average of best two mark as 100% 
                            stuGrade = __GetGrade(pRows[4], objStudent["100% of IAT"], arrStudents[stuIndx]["regulation"]);
                            objStudent["Grade"] = stuGrade["grade"];
                        } else {
                            objStudent["Total Of 2 Review"] = strTotal
                            objStudent["100% of Review"] = Math.round((strTotal / 2)); // calculate average of best two mark as 100% 
                            stuGrade = __GetGrade(pRows[4], objStudent["100% of Review"], arrStudents[stuIndx]["regulation"]);
                            objStudent["Grade"] = stuGrade["grade"];
                        }
                        __CountGrade(objGrade, objStudent["Grade"]);
                        lstStudents.push(objStudent);
                        __AddOverallStatus(lstOverAllStatus, arrStudents[stuIndx]['registerNo'], arrStudents[stuIndx]['stuName'], pRows[3][subIndx]['subCode'], pRows[3][subIndx]['subCredit'], ((strSubType == "E") ? objStudent["100% of IAT"] : objStudent["100% of Review"]), stuGrade);
                    }
                    else { // add elective not taken students only in overall status report
                        __AddOverallStatus(lstOverAllStatus, arrStudents[stuIndx]['registerNo'], arrStudents[stuIndx]['stuName'], pRows[3][subIndx]['subCode'], pRows[3][subIndx]['subCredit'], "-", { "grade": "-", "grade_point": 0 });
                    }
                } else if (strSubType == "P") {
                    arrSubStudents = pRows[2].filter(obj => { return obj.subCode == pRows[3][subIndx]["subCode"] })
                    arrSubStudents = arrSubStudents.map(obj => { return obj.registerNo })
                        .filter((value, index, self) => self.indexOf(value) === index)

                    // To get current semester lab experiment mark
                    let lstLabExprMark = pRows[2].filter(obj => { return obj.registerNo == arrStudents[stuIndx]["registerNo"] && obj.subCode == pRows[3][subIndx]["subCode"] })

                    __CalculateLabExperimentMark(lstLabExprMark, objStudent);

                    objStudent["Total Converted To 100"] = Math.round(objStudent["Total Converted To 100"]);
                    let stuGrade = __GetGrade(pRows[4], objStudent["Total Converted To 100"], arrStudents[stuIndx]["regulation"]);
                    objStudent["Grade"] = stuGrade["grade"];

                    __CountGrade(objGrade, objStudent["Grade"]);
                    lstStudents.push(objStudent);
                    __AddOverallStatus(lstOverAllStatus, arrStudents[stuIndx]['registerNo'], arrStudents[stuIndx]['stuName'], pRows[3][subIndx]['subCode'], pRows[3][subIndx]['subCredit'], objStudent["Total Converted To 100"], stuGrade);
                } else if (strSubType == "C") {
                    arrSubStudents = pRows[1].filter(obj => { return obj.subCode == pRows[3][subIndx]["subCode"] })
                    arrSubStudents = arrSubStudents.map(obj => { return obj.registerNo })
                        .filter((value, index, self) => self.indexOf(value) === index)

                    // To get current semester IAT mark
                    let lstIATMark = pRows[1].filter(obj => { return obj.registerNo == arrStudents[stuIndx]["registerNo"] && obj.subCode == pRows[3][subIndx]["subCode"] })

                    let strTotal = __BestOfTwoIAT(lstIATMark, objStudent)

                    objStudent["Total Of 2 IAT"] = strTotal
                    let str100mark = (strTotal / 2) // calculate average of best two IAT mark as 100 %
                    objStudent["70% of IAT"] = parseFloat((str100mark / 100) * 70).toFixed(2)  // calculate 70 %

                    // To get current semester lab experiment mark
                    let lstLabExprMark = pRows[2].filter(obj => { return obj.registerNo == arrStudents[stuIndx]["registerNo"] && obj.subCode == pRows[3][subIndx]["subCode"] })

                    __CalculateLabExperimentMark(lstLabExprMark, objStudent);

                    objStudent["30% of ExpMarks"] = parseFloat((objStudent["Total Converted To 100"] / 100) * 30).toFixed(2);

                    objStudent["Total"] = Math.round(parseFloat(objStudent["30% of ExpMarks"]) + parseFloat(objStudent["70% of IAT"]))  // 30%+70%
                    let stuGrade = __GetGrade(pRows[4], objStudent["Total"], arrStudents[stuIndx]["regulation"]);
                    objStudent["Grade"] = stuGrade["grade"];

                    __CountGrade(objGrade, objStudent["Grade"]);
                    lstStudents.push(objStudent);
                    __AddOverallStatus(lstOverAllStatus, arrStudents[stuIndx]['registerNo'], arrStudents[stuIndx]['stuName'], pRows[3][subIndx]['subCode'], pRows[3][subIndx]['subCredit'], objStudent["Total"], stuGrade);
                }
            } else if (strRegulation == "R2019") {
                if (strSubType == "T") {

                    /** Prev university theory              - 30%
                     *  current Sem IAT sum(max of 2 IAT)   - 70%
                     */

                    // To get previous semester university external mark 
                    let lstPrevUnivMark = pRows[0].filter(obj => { return obj['registerNo'] == arrStudents[stuIndx]['registerNo'] })

                    let tmp = lstPrevExternalMark.filter(obj => { return obj.registerNo == arrStudents[stuIndx]['registerNo'] })
                    if (tmp.length > 0) {
                        objStudent["Conversion of Theory Externals - ODD SEM (March / April 2020)"] = tmp[0]['prevMark'];
                    } else {
                        objStudent["Conversion of Theory Externals - ODD SEM (March / April 2020)"] = __GetPrevTheoryExternal(lstPrevUnivMark, lstPrevExternalMark);
                    }

                    arrSubStudents = pRows[1].filter(obj => { return obj.subCode == pRows[3][subIndx]["subCode"] })
                    arrSubStudents = arrSubStudents.map(obj => { return obj.registerNo })
                        .filter((value, index, self) => self.indexOf(value) === index)

                    // To get current semester IAT mark                    
                    let lstIATMark = pRows[1].filter(obj => { return obj.registerNo == arrStudents[stuIndx]["registerNo"] && obj.subCode == pRows[3][subIndx]["subCode"] })

                    let str100mark = __CalculateCATAndFAT(lstIATMark, objStudent)

                    objStudent["70% of CAT and FAT"] = parseFloat((str100mark / 100) * 70).toFixed(2)  // calculate 70 %
                    objStudent["Total"] = Math.round(parseFloat(objStudent["Conversion of Theory Externals - ODD SEM (March / April 2020)"]['30%']) + parseFloat(objStudent["70% of CAT and FAT"]))  // 30%+70%
                    let stuGrade = __GetGrade(pRows[4], objStudent["Total"], arrStudents[stuIndx]["regulation"]);
                    objStudent["Grade"] = stuGrade["grade"];

                    __CountGrade(objGrade, objStudent["Grade"]);
                    lstStudents.push(objStudent);
                    __AddOverallStatus(lstOverAllStatus, arrStudents[stuIndx]['registerNo'], arrStudents[stuIndx]['stuName'], pRows[3][subIndx]['subCode'], pRows[3][subIndx]['subCredit'], objStudent["Total"], stuGrade);
                } else if (strSubType == "E") {

                    arrSubStudents = pRows[1].filter(obj => { return obj.subCode == pRows[3][subIndx]["subCode"] })
                    arrSubStudents = arrSubStudents.map(obj => { return obj.registerNo })
                        .filter((value, index, self) => self.indexOf(value) === index);

                    // To get current semester IAT mark
                    let lstIATMark = pRows[1].filter(obj => { return obj.registerNo == arrStudents[stuIndx]["registerNo"] && obj.subCode == pRows[3][subIndx]["subCode"] })
                    if (lstIATMark.length > 0) {
                        let strTotal = __CalculateCATAndFAT(lstIATMark, objStudent)

                        objStudent["100% of CAT and FAT"] = Math.round(strTotal) // calculate average of best two mark as 100% 
                        let stuGrade = __GetGrade(pRows[4], objStudent["100% of CAT and FAT"], arrStudents[stuIndx]["regulation"]);
                        objStudent["Grade"] = stuGrade["grade"];

                        __CountGrade(objGrade, objStudent["Grade"]);
                        lstStudents.push(objStudent);
                        __AddOverallStatus(lstOverAllStatus, arrStudents[stuIndx]['registerNo'], arrStudents[stuIndx]['stuName'], pRows[3][subIndx]['subCode'], pRows[3][subIndx]['subCredit'], objStudent["100% of CAT and FAT"], stuGrade);
                    }
                    else { // add elective not taken students only in overall status report
                        __AddOverallStatus(lstOverAllStatus, arrStudents[stuIndx]['registerNo'], arrStudents[stuIndx]['stuName'], pRows[3][subIndx]['subCode'], pRows[3][subIndx]['subCredit'], "-", { "grade": "-", "grade_point": 0 });
                    }
                } else if (strSubType == "P") {
                    arrSubStudents = pRows[2].filter(obj => { return obj.subCode == pRows[3][subIndx]["subCode"] })
                    arrSubStudents = arrSubStudents.map(obj => { return obj.registerNo })
                        .filter((value, index, self) => self.indexOf(value) === index);

                    // To get current semester lab experiment mark
                    let lstLabExprMark = pRows[2].filter(obj => { return obj.registerNo == arrStudents[stuIndx]["registerNo"] && obj.subCode == pRows[3][subIndx]["subCode"] })

                    __CalculateLabExperimentMark(lstLabExprMark, objStudent);

                    objStudent["Total Converted To 100"] = Math.round(objStudent["Total Converted To 100"]);
                    let stuGrade = __GetGrade(pRows[4], objStudent["Total Converted To 100"], arrStudents[stuIndx]["regulation"]);
                    objStudent["Grade"] = stuGrade["grade"];

                    __CountGrade(objGrade, objStudent["Grade"]);
                    lstStudents.push(objStudent);
                    __AddOverallStatus(lstOverAllStatus, arrStudents[stuIndx]['registerNo'], arrStudents[stuIndx]['stuName'], pRows[3][subIndx]['subCode'], pRows[3][subIndx]['subCredit'], objStudent["Total Converted To 100"], stuGrade);
                } else if (strSubType == "C") {
                    arrSubStudents = pRows[1].filter(obj => { return obj.subCode == pRows[3][subIndx]["subCode"] })
                    arrSubStudents = arrSubStudents.map(obj => { return obj.registerNo })
                        .filter((value, index, self) => self.indexOf(value) === index);

                    // To get current semester IAT mark
                    let lstIATMark = pRows[1].filter(obj => { return obj.registerNo == arrStudents[stuIndx]["registerNo"] && obj.subCode == pRows[3][subIndx]["subCode"] })

                    let str100mark = __CalculateCATAndFAT(lstIATMark, objStudent)

                    objStudent["70% of CAT and FAT"] = parseFloat((str100mark / 100) * 70).toFixed(2)  // calculate 70 %

                    // To get current semester lab experiment mark
                    let lstLabExprMark = pRows[2].filter(obj => { return obj.registerNo == arrStudents[stuIndx]["registerNo"] && obj.subCode == pRows[3][subIndx]["subCode"] })

                    __CalculateLabExperimentMark(lstLabExprMark, objStudent);

                    objStudent["30% of ExpMarks"] = parseFloat((objStudent["Total Converted To 100"] / 100) * 30).toFixed(2);

                    objStudent["Total"] = Math.round(parseFloat(objStudent["30% of ExpMarks"]) + parseFloat(objStudent["70% of CAT and FAT"]))  // 30%+70%
                    let stuGrade = __GetGrade(pRows[4], objStudent["Total"], arrStudents[stuIndx]["regulation"]);
                    objStudent["Grade"] = stuGrade["grade"];

                    __CountGrade(objGrade, objStudent["Grade"]);
                    lstStudents.push(objStudent);
                    __AddOverallStatus(lstOverAllStatus, arrStudents[stuIndx]['registerNo'], arrStudents[stuIndx]['stuName'], pRows[3][subIndx]['subCode'], pRows[3][subIndx]['subCredit'], objStudent["Total"], stuGrade);
                } else if (strSubType == "J") {
                    arrSubStudents = pRows[1].filter(obj => { return obj.subCode == pRows[3][subIndx]["subCode"] })
                    arrSubStudents = arrSubStudents.map(obj => { return obj.registerNo })
                        .filter((value, index, self) => self.indexOf(value) === index);

                    let lstIATMark = pRows[1].filter(obj => { return obj.registerNo == arrStudents[stuIndx]["registerNo"] && obj.subCode == pRows[3][subIndx]["subCode"] })

                    if (lstIATMark.length > 0) {
                        let strTotal = __BestOfTwoIAT(lstIATMark, objStudent)

                        objStudent["Total of Best 2 Reviews"] = strTotal
                        objStudent["100% of Best 2 Reviews"] = Math.round((strTotal / 2)) // calculate average of best two mark as 100% 
                        let stuGrade = __GetGrade(pRows[4], objStudent["100% of Best 2 Reviews"], arrStudents[stuIndx]["regulation"]);
                        objStudent["Grade"] = stuGrade["grade"];

                        __CountGrade(objGrade, objStudent["Grade"]);
                        lstStudents.push(objStudent);
                        __AddOverallStatus(lstOverAllStatus, arrStudents[stuIndx]['registerNo'], arrStudents[stuIndx]['stuName'], pRows[3][subIndx]['subCode'], pRows[3][subIndx]['subCredit'], objStudent["100% of Best 2 Reviews"], stuGrade);
                    }
                }
            }

            // To count subwise passcount
            if (objStudent["Grade"] == "RA" || objStudent["Grade"] == "AB") {
                if (arrSubwiseFailureCount.indexOf(arrStudents[stuIndx]["registerNo"]) < 0)
                    arrSubwiseFailureCount.push(arrStudents[stuIndx]["registerNo"]);
            }
            // To count overall subject passcount (all pass count)
            if (objStudent["Grade"] == "RA" || objStudent["Grade"] == "AB") {
                if (arrOverallFailureCount.indexOf(arrStudents[stuIndx]["registerNo"]) < 0)
                    arrOverallFailureCount.push(arrStudents[stuIndx]["registerNo"]);
            }
        }

        // overall grade count report 
        for (let key in objGrade) {
            let arrTmp = lstOverallGradeCount.filter(item => { return item["Grade"] == key });
            if (arrTmp.length > 0) {
                arrTmp[0][pRows[3][subIndx]['subCode']] = objGrade[key];
            }
            else {
                let obj = { "Grade": key }
                obj[pRows[3][subIndx]['subCode']] = objGrade[key]
                lstOverallGradeCount.push(obj);
            }
        }

        let strSubTypeExpansion = "";
        if (pRows[3][subIndx]['subType'] == "T")
            strSubTypeExpansion = "Theory"
        else if (pRows[3][subIndx]['subType'] == "P")
            strSubTypeExpansion = "Practical"
        else if (pRows[3][subIndx]['subType'] == "J")
            strSubTypeExpansion = "Project"
        else if (pRows[3][subIndx]['subType'] == "C")
            strSubTypeExpansion = "Theory Cum Practical"
        else if (pRows[3][subIndx]['subType'] == "E")
            strSubTypeExpansion = "Elective"

        lstSubjects.push({
            "SubjectCode": pRows[3][subIndx]['subCode'],
            "SubjectName": pRows[3][subIndx]['subName'],
            "SubjectType": strSubTypeExpansion,
            "SubjectTypeAcr": pRows[3][subIndx]['subType'],
            "Grade": objGrade,
            "StudentList": lstStudents
        })

        lstSubWisePassPercentage.push({
            "subCode": pRows[3][subIndx]['subCode'],
            "subName": pRows[3][subIndx]['subName'],
            "studentsReg": arrSubStudents.length,
            "studentsPassed": (arrSubStudents.length - arrSubwiseFailureCount.length),
            "pass%": parseFloat(((arrSubStudents.length - arrSubwiseFailureCount.length) / arrSubStudents.length) * 100).toFixed(2)
        })
    }

    // To change the property order "ArearCount to Last"
    for (let k = 0; k < lstOverAllStatus.length; k++) {
        let strArearCount = lstOverAllStatus[k]['ArrearCount'];
        delete lstOverAllStatus[k]['ArrearCount'];
        lstOverAllStatus[k]['ArrearCount'] = strArearCount;
        lstOverAllStatus[k]['GPA'] = parseFloat(lstOverAllStatus[k]["sumofEarnedCredit"] / lstOverAllStatus[k]["sumofSubCredit"]).toFixed(3);
        delete lstOverAllStatus[k]['sumofEarnedCredit'];
        delete lstOverAllStatus[k]['sumofSubCredit'];
    }
    // Overall GPA count report
    let objGPACount = {};
    let arrGpaRange = [{ "from": 9.1, "to": 10.0 }, { "from": 8.1, "to": 9.0 }, { "from": 7.1, "to": 8.0 }, { "from": 6.1, "to": 7.0 }, { "from": 5.1, "to": 6.0 }, { "from": 0, "to": 5.0 }];
    for (let i = 0; i < arrGpaRange.length; i++) {
        let lstTmp = lstOverAllStatus.filter(obj => {
            return (obj["GPA"] >= arrGpaRange[i]['from'] && obj["GPA"] <= arrGpaRange[i]['to']);
        });
        let strKey = arrGpaRange[i]["from"].toString() + "-" + arrGpaRange[i]["to"].toString();
        objGPACount[strKey] = lstTmp.length;
    }

    lstSubjects.push({
        "SubjectCode": "Overall Results",
        "SubjectTypeAcr": "O",
        "GPA": objGPACount,
        "GradeList": lstOverallGradeCount,
        "PassList": {
            "totalStuReg": arrStudents.length,
            "totalPass": (arrStudents.length - arrOverallFailureCount.length),
            "overallPass%": parseFloat(((arrStudents.length - arrOverallFailureCount.length) / arrStudents.length) * 100).toFixed(2),
            "subwisePass%": lstSubWisePassPercentage
        },
        "StudentList": lstOverAllStatus
    })
    let objResult = {
        "testAcr": (pRows[5].length > 0) ? pRows[5][0]['testName'] : "",
        "collegeCode": (pRows[6].length > 0) ? pRows[6][0]['collegeCode'] : "",
        "collegeName": (pRows[6].length > 0) ? pRows[6][0]['collegeName'] : "",
        "collegeAddr": (pRows[6].length > 0) ? pRows[6][0]['collegeAddr'] : "",
        "courseCode": (pRows[6].length > 0) ? pRows[6][0]['courseCode'] : "",
        "courseDegree": (pRows[6].length > 0) ? pRows[6][0]['courseDegree'] : "",
        "courseName": (pRows[6].length > 0) ? pRows[6][0]['courseName'] : "",
        "curSemester": (pRows[6].length > 0) ? pRows[6][0]['semester'].toString().padStart(2, '0') : "",
        "subjectList": lstSubjects
    }
    return objResult;
}

function __BestOfTwoIAT(pIATMark, pStudent) {
    if (pStudent != null) {
        for (let i = 0; i < pIATMark.length; i++) {
            pStudent[pIATMark[i]["testAcr"]] = pIATMark[i]["mark"]
        }
    }
    pIATMark.sort(function (a, b) {
        return b.mark - a.mark
    });
    let strTotal = 0;
    for (let i = 0; i < pIATMark.length; i++) {
        if (i < 2) // sum of maximum of two marks
            strTotal = strTotal + pIATMark[i]["mark"]
    }
    return strTotal;
}

function __CalculateLabExperimentMark(lstLabExprMark, objStudent) {
    // To get current semester lab experiment mark

    let strTotal = 0, strMaxTotal = 0, objMark = {};
    for (let i = 0; i < lstLabExprMark.length; i++) {
        objMark[lstLabExprMark[i]["labExprName"]] = lstLabExprMark[i]["mark"]
        strTotal = strTotal + ((lstLabExprMark[i]["mark"] < 0) ? 0 : lstLabExprMark[i]["mark"])
        strMaxTotal = strMaxTotal + lstLabExprMark[i]["maxMark"]
    }
    objStudent["Exp.Marks"] = objMark;
    objStudent["Total Exp.Marks"] = strTotal;
    objStudent["Total Converted To 100"] = parseFloat((strTotal / strMaxTotal) * 100).toFixed(2) // calculate the mark to 100%
}

function __GetPrevTheoryExternal(pRows, lstPrevExternalMark) {
    let obj = {}, strTotal = 0;

    for (let i = 0; i < pRows.length; i++) {
        obj[pRows[i]["subCode"]] = pRows[i]["extMark"]
        strTotal = strTotal + pRows[i]["extMark"]
    }
    obj["Total"] = strTotal
    let str100Mark = (strTotal / (pRows.length * 100)) * 100 // calculate for 100 mark
    obj["30%"] = parseFloat((str100Mark / 100) * 30).toFixed(2) // calculate 30%
    lstPrevExternalMark.push({ "registerNo": pRows[0]["registerNo"], "prevMark": obj })
    return obj;
}

function __GetGrade(pGradeRows, pTotalMark, pRegulation) {
    let strGrade = {};
    let arrGrade = pGradeRows.filter(function (item) {
        return item['regulation'] == pRegulation && (pTotalMark >= item['mark_from'] && pTotalMark <= item['mark_to'])
    })
    if (arrGrade.length > 0) {
        strGrade["grade"] = arrGrade[0]["grade"]
        strGrade["grade_point"] = arrGrade[0]["grade_point"]
    }
    return strGrade;
}

function __AddOverallStatus(pLstOverallStatus, pRegisterNo, pStuName, pSubCode, pSubCredit, pTotalMark, pGrade) {
    let tmp = pLstOverallStatus.filter(obj => { return obj["Register No"] == pRegisterNo })
    if (tmp.length > 0) {
        tmp[0][pSubCode] = { "Total": pTotalMark, "Grade": pGrade["grade"] };
        tmp[0]['ArrearCount'] = ((pGrade["grade"] == 'RA') ? tmp[0]['ArrearCount'] + 1 : tmp[0]['ArrearCount'])

        tmp[0]["sumofEarnedCredit"] = tmp[0]["sumofEarnedCredit"] + (pSubCredit * pGrade["grade_point"]);
        tmp[0]["sumofSubCredit"] = tmp[0]["sumofSubCredit"] + ((pGrade["grade"] == '-') ? 0 : pSubCredit);
    } else {
        let obj = {
            "Register No": pRegisterNo,
            "Student Name": pStuName
        }
        obj['ArrearCount'] = 0;
        obj["sumofEarnedCredit"] = 0;
        obj["sumofSubCredit"] = 0;
        obj[pSubCode] = { "Total": pTotalMark, "Grade": pGrade["grade"] }
        obj['ArrearCount'] = ((pGrade["grade"] == 'RA') ? obj['ArrearCount'] + 1 : obj['ArrearCount'])
        obj["sumofEarnedCredit"] = obj["sumofEarnedCredit"] + (pSubCredit * pGrade["grade_point"]);
        obj["sumofSubCredit"] = obj["sumofSubCredit"] + ((pGrade["grade"] == '-') ? 0 : pSubCredit);
        pLstOverallStatus.push(obj);
    }
}

function __CalculateCATAndFAT(lstCATFATMark, objStudent) {
    // To get current semester lab experiment mark

    let strTotal = 0, strMaxTotal = 0;

    for (let i = 0; i < lstCATFATMark.length; i++) {
        objStudent[lstCATFATMark[i]["testAcr"]] = lstCATFATMark[i]["mark"]
    }

    // To find best CAT mark
    let lstCAT = lstCATFATMark.filter(function (objMark) {
        return objMark['testAcr'].toUpperCase().indexOf("CAT") >= 0
    })

    lstCAT.sort(function (a, b) {
        return b.mark - a.mark;
    })

    if (lstCAT.length > 0) {
        strTotal = parseFloat(lstCAT[0]["mark"]);
        strMaxTotal = parseFloat(lstCAT[0]["maxMark"]);
    }

    let strTmp = lstCAT[0]["testAcr"].toString().split(" ")[1];

    let lstFAT = lstCATFATMark.filter(function (objMark) {
        return objMark['testAcr'].toUpperCase().indexOf("FAT") >= 0 && objMark['testAcr'].toUpperCase().indexOf(strTmp) >= 0;
    })

    if (lstFAT.length > 0) {
        strTotal = strTotal + parseFloat(lstFAT[0]["mark"]);
        strMaxTotal = strMaxTotal + parseFloat(lstFAT[0]["maxMark"]);
    }

    objStudent["Total of Best CAT and FAT"] = strTotal;
    return parseFloat((strTotal / strMaxTotal) * 100).toFixed(2) // calculate the mark to 100%
}

function __CountGrade(pObjGrade, pKey) {
    if (pKey in pObjGrade)
        pObjGrade[pKey] = pObjGrade[pKey] + 1
    else
        pObjGrade[pKey] = 1
}

module.exports.PrepareArrearMarkCalculationOnetime = (pRows) => {
    let lstPrevExternalMark = [], lstCourseList = [];
    let lstPrevSemMark = pRows[1];

    let lstUniqueCourses = pRows[0].map(function (obj) { return { "courseId": obj.courseId, "course": obj.course }; });
    lstUniqueCourses = lstUniqueCourses.filter((value, index, self) => self.map(x => x.courseId).indexOf(value.courseId) == index)

    // lstUniqueCourses = [{ courseId: 2, course: 'BE - CSE' }]

    for (let courseIndx = 0; courseIndx < lstUniqueCourses.length; courseIndx++) {
        let lstCourse = pRows[0].filter(function (item) {
            return item['courseId'] == lstUniqueCourses[courseIndx]['courseId']
        })

        let lstUniqueSubType = lstCourse.map(function (obj) { return obj.subType })
            .filter((value, index, self) => self.indexOf(value) === index);

        let lstSubType = [];
        let strFailedScripts = 0;
        let arrRange = [{ "from": 1, "to": 5 }, { "from": 6, "to": 10 }, { "from": 11, "to": 20 }, { "from": 21, "to": 30 }, { "from": 31, "to": 40 }, { "from": 41, "to": 49 }];
        let objPassRangeCount = { "1-5": 0, "6-10": 0, "11-20": 0, "21-30": 0, "31-40": 0, "41-49": 0 };
        for (let typeIndx = 0; typeIndx < lstUniqueSubType.length; typeIndx++) {

            let lstUniqueSubjects = lstCourse.map(function (obj) { return { "subCode": obj.subCode, "subName": obj.subName, "subType": obj.subType, "subCredit": obj.subCredit }; });
            lstUniqueSubjects = lstUniqueSubjects.filter((value, index, self) => self.map(x => x.subCode).indexOf(value.subCode) == index)

            lstUniqueSubjects = lstUniqueSubjects.filter(function (obj) { return obj.subType == lstUniqueSubType[typeIndx] })

            let lstStudents = [];
            let strMaxNoofSubjects = 0;

            for (let subIndx = 0; subIndx < lstUniqueSubjects.length; subIndx++) {
                let strSubType = lstUniqueSubjects[subIndx]['subType'];

                let lstSubStudents = lstCourse.filter(function (item) {
                    return item['subCode'] == lstUniqueSubjects[subIndx]['subCode']
                })

                let lstUniqueStudents = lstSubStudents.map(function (obj) { return { "registerNo": obj.registerNo, "stuName": obj.stuName, "regulation": obj.regulation }; });
                lstUniqueStudents = lstUniqueStudents.filter((value, index, self) => self.map(x => x.registerNo).indexOf(value.registerNo) == index)

                for (stuIndx = 0; stuIndx < lstUniqueStudents.length; stuIndx++) {
                    let objStudent = { "Register Number": lstUniqueStudents[stuIndx]["registerNo"], "Student Name": lstUniqueStudents[stuIndx]["stuName"], "Subject Code": lstUniqueSubjects[subIndx]['subCode'], "Subject Name": lstUniqueSubjects[subIndx]['subName'] };

                    if (strSubType == "T") {
                        /** Prev university theory - 30%
                        * same paper prev sem Internal mark - 70%
                        */
                        let lstPrevUnivMark = lstPrevSemMark.filter(obj => { return obj['registerNo'] == lstUniqueStudents[stuIndx]['registerNo'] })
                        strMaxNoofSubjects = (strMaxNoofSubjects < lstPrevUnivMark.length) ? lstPrevUnivMark.length : strMaxNoofSubjects;

                        let tmp = lstPrevExternalMark.filter(obj => { obj.registerNo == lstUniqueStudents[stuIndx]['registerNo'] })
                        if (tmp.length > 0) {
                            objStudent["Conversion of Theory Externals - ODD SEM (March / April 2020)"] = tmp[0]['prevMark'];
                        } else {
                            objStudent["Conversion of Theory Externals - ODD SEM (March / April 2020)"] = __GetPrevTheoryExternalForArrear(lstPrevUnivMark, lstPrevExternalMark);
                        }

                        // To previous semester Internal mark for current (same subject) -> 70%
                        let lstPrevSemInternalMark = lstSubStudents.filter(obj => { return obj.registerNo == lstUniqueStudents[stuIndx]["registerNo"] })
                        let strMaxInternalMark = __GetMaxInternalMark(lstUniqueStudents[stuIndx]["regulation"]);

                        if (lstPrevSemInternalMark.length > 0) {
                            let strKey = "Internal Marks (" + strMaxInternalMark + ")"
                            objStudent[strKey] = lstPrevSemInternalMark[0]["intMark"]
                            objStudent["70% of Internal Marks"] = parseFloat((lstPrevSemInternalMark[0]["intMark"] / strMaxInternalMark) * 70).toFixed(2);
                            objStudent["Total"] = Math.round(parseFloat(objStudent["Conversion of Theory Externals - ODD SEM (March / April 2020)"]['30%']) + parseFloat(objStudent["70% of Internal Marks"])) // 30%+70%
                            let stuGrade = __GetGrade(pRows[3], objStudent["Total"], lstUniqueStudents[stuIndx]["regulation"]);
                            objStudent["Grade"] = stuGrade["grade"];
                            objStudent["GradePoint"] = stuGrade["grade_point"];
                            objStudent["extMark(100)"] = objStudent["Total"];
                        }
                    } else if (strSubType == "E") {
                        // To previous semester Internal mark for current (same subject) -> 100%
                        let lstPrevSemInternalMark = lstSubStudents.filter(obj => { return obj.registerNo == lstUniqueStudents[stuIndx]["registerNo"] })
                        let strMaxInternalMark = __GetMaxInternalMark(lstUniqueStudents[stuIndx]["regulation"]);

                        if (lstPrevSemInternalMark.length > 0) {
                            let strKey = "Internal Marks (" + strMaxInternalMark + ")"
                            objStudent[strKey] = lstPrevSemInternalMark[0]["intMark"]
                            objStudent["100% of Internal Marks"] = Math.round((lstPrevSemInternalMark[0]["intMark"] / strMaxInternalMark) * 100);
                            let stuGrade = __GetGrade(pRows[3], objStudent["100% of Internal Marks"], lstUniqueStudents[stuIndx]["regulation"]);
                            objStudent["Grade"] = stuGrade["grade"];
                            objStudent["GradePoint"] = stuGrade["grade_point"];
                            objStudent["extMark(100)"] = objStudent["100% of Internal Marks"];
                        }
                    } else if (strSubType == "C") {
                        /** Previous sem Internal Mark - 70%
                        * Previous sem current subject lab experiments - 30% */

                        // To previous semester Internal mark for current (same subject) -> 70%
                        let lstPrevSemInternalMark = lstSubStudents.filter(obj => { return obj.registerNo == lstUniqueStudents[stuIndx]["registerNo"] })
                        let strMaxInternalMark = __GetMaxInternalMark(lstUniqueStudents[stuIndx]["regulation"]);
                        let strKey = "Internal Marks (" + strMaxInternalMark + ")"
                        objStudent[strKey] = lstPrevSemInternalMark[0]["intMark"]
                        objStudent["70% of Internal Marks"] = parseFloat((lstPrevSemInternalMark[0]["intMark"] / strMaxInternalMark) * 70).toFixed(2);

                        // current subject lab experiments mark (30%)
                        let lstPrevLabExpr = pRows[2].filter(function (obj) {
                            return obj["subCode"] == lstUniqueSubjects[subIndx]["subCode"] && obj["registerNo"] == lstUniqueStudents[stuIndx]["registerNo"]
                        });

                        __GetLabExperiments(lstPrevLabExpr, objStudent);

                        objStudent["30% of Exp. Marks"] = parseFloat((objStudent["Total Converted To 100"] / 100) * 30).toFixed(2);
                        objStudent["Total"] = Math.round(parseFloat(objStudent["70% of Internal Marks"]) + parseFloat(objStudent["30% of Exp. Marks"]));

                        let stuGrade = __GetGrade(pRows[3], objStudent["Total"], lstUniqueStudents[stuIndx]["regulation"]);
                        objStudent["Grade"] = stuGrade["grade"];
                        objStudent["GradePoint"] = stuGrade["grade_point"];
                        objStudent["extMark(100)"] = objStudent["Total"];
                    } else if (strSubType == "P") {
                        // current subject lab experiments mark (30%)
                        let lstPrevLabExpr = pRows[2].filter(function (obj) {
                            return obj["subCode"] == lstUniqueSubjects[subIndx]["subCode"] && obj["registerNo"] == lstUniqueStudents[stuIndx]["registerNo"]
                        });

                        __GetLabExperiments(lstPrevLabExpr, objStudent);

                        let stuGrade = __GetGrade(pRows[3], objStudent["Total Converted To 100"], lstUniqueStudents[stuIndx]["regulation"]);
                        objStudent["Grade"] = stuGrade["grade"];
                        objStudent["GradePoint"] = stuGrade["grade_point"];
                        objStudent["extMark(100)"] = objStudent["Total Converted To 100"];
                    }

                    // count no of scripts failure
                    if (objStudent["extMark(100)"] < 50)
                        strFailedScripts = strFailedScripts + 1;

                    lstStudents.push(objStudent);
                }
            }

            let strSubTypeExpansion = "";
            if (lstUniqueSubType[typeIndx] == "T")
                strSubTypeExpansion = "Theory"
            else if (lstUniqueSubType[typeIndx] == "P")
                strSubTypeExpansion = "Practical"
            else if (lstUniqueSubType[typeIndx] == "J")
                strSubTypeExpansion = "Project"
            else if (lstUniqueSubType[typeIndx] == "C")
                strSubTypeExpansion = "Theory Cum Practical"
            else if (lstUniqueSubType[typeIndx] == "E")
                strSubTypeExpansion = "Elective"

            let objSubType = {
                "subTypeAcr": lstUniqueSubType[typeIndx],
                "subType": strSubTypeExpansion
            }
            if (lstUniqueSubType[typeIndx] == "T")
                objSubType["maximumSubjectCount"] = strMaxNoofSubjects

            objSubType["studentList"] = lstStudents
            lstSubType.push(objSubType);

            // To Sort by RegisterNo
            lstStudents.sort(function (a, b) {
                return a["Register Number"] - b["Register Number"]
            });
            // Overall pass range count report
            for (let i = 0; i < lstStudents.length; i++) {
                let strMark = 50 - lstStudents[i]["extMark(100)"];
                lstStudents[i]["Required Marks"] = "-";
                if (strMark > 0) {
                    let lstTmp = arrRange.filter(obj => {
                        return (strMark >= obj['from'] && strMark <= obj['to']);
                    });
                    if (lstTmp.length > 0) {
                        let strKey = lstTmp[0]["from"].toString() + "-" + lstTmp[0]["to"].toString();
                        objPassRangeCount[strKey] = objPassRangeCount[strKey] + 1;
                    }
                    lstStudents[i]["Required Marks"] = strMark;
                }
                delete lstStudents[i]["GradePoint"];
                delete lstStudents[i]["extMark(100)"];
            }

        }
        lstSubType.push({
            "subTypeAcr": "O",
            "subType": "Overall Results",
            "totalScripts": lstCourse.length,
            "passedScripts": lstCourse.length - strFailedScripts,
            "passRangeCount": objPassRangeCount
        })
        lstCourseList.push({
            "courseId": lstUniqueCourses[courseIndx]['courseId'],
            "courseName": lstUniqueCourses[courseIndx]['course'],
            "subjectList": lstSubType
        });
    }
    return lstCourseList;
}

function __GetMaxInternalMark(pRegulation) {
    if (pRegulation == "R2019" || pRegulation == "R2020")
        return 40;
    else
        return 20;
}

function __GetLabExperiments(pLabExpr, pObjStudent) {
    let objExpr = {};
    let strTotal = 0, strMaxTotal = 0;
    for (let exprIndx = 0; exprIndx < pLabExpr.length; exprIndx++) {
        objExpr[pLabExpr[exprIndx]["testAcr"] + "(100)"] = pLabExpr[exprIndx]["mark"];
        strTotal = strTotal + parseFloat(pLabExpr[exprIndx]["mark"]);
        strMaxTotal = strMaxTotal + parseFloat(pLabExpr[exprIndx]["maxMark"]);
    }
    pObjStudent["Exp.Marks"] = objExpr;
    pObjStudent["Total Converted To 100"] = parseFloat((strTotal / strMaxTotal) * 100).toFixed(2);
}

function __GetPrevTheoryExternalForArrear(pRows, lstPrevExternalMark) {
    let obj = {}, strTotal = 0;

    for (let i = 0; i < pRows.length; i++) {
        obj["S" + (i + 1)] = pRows[i]["subCode"] + " - " + pRows[i]["extMark"].toString()
        strTotal = strTotal + pRows[i]["extMark"]
    }
    obj["Total"] = strTotal
    let str100Mark = (strTotal / (pRows.length * 100)) * 100 // calculate for 100 mark
    obj["30%"] = parseFloat((str100Mark / 100) * 30).toFixed(2) // calculate 30%
    lstPrevExternalMark.push({ "registerNo": pRows[0]["registerNo"], "prevMark": obj })
    return obj;
}

module.exports.PrepareFinalYearMarkCalculationOnetime = (pRows) => {

    let lstSubjects = [], lstOverAllStatus = [], arrOverallFailureCount = [],
        lstOverallGradeCount = [], lstSubWisePassPercentage = [];

    // To prepare the grade object based on regulation
    let lstGrades = pRows[3].filter(function (obj) {
        return obj.regulation == pRows[0][0]["regulation"]
    });

    let lstTotalStudents = pRows[1].map(function (obj) { return obj.registerNo });
    lstTotalStudents = lstTotalStudents.filter((value, index, self) => self.map(x => x).indexOf(value) == index)

    for (let subIndx = 0; subIndx < pRows[2].length; subIndx++) {
        let arrSubwiseFailureCount = [], objGrade = {};

        for (let grdIndx = 0; grdIndx < lstGrades.length; grdIndx++) {
            objGrade[lstGrades[grdIndx]['grade']] = 0
        }

        let arrSubStudents = pRows[1].filter(function (item) {
            return item['subCode'] == pRows[2][subIndx]['subCode'] //&& item['section'] == pRows[2][subIndx]['section']
        })

        let lstUniqueStudents = arrSubStudents.map(function (obj) { return { "registerNo": obj.registerNo, "studentName": obj.studentName, "regulation": obj.regulation }; });
        lstUniqueStudents = lstUniqueStudents.filter((value, index, self) => self.map(x => x.registerNo).indexOf(value.registerNo) == index)

        let lstStudents = [];
        for (let stuIndx = 0; stuIndx < lstUniqueStudents.length; stuIndx++) {
            let objStudent = {
                "Register No": lstUniqueStudents[stuIndx]["registerNo"],
                "Student Name": lstUniqueStudents[stuIndx]["studentName"]
            }
            let lstStudent = pRows[0].filter(function (item) {
                return item['registerNo'] == lstUniqueStudents[stuIndx]['registerNo']
            })


            if (pRows[2][subIndx]["subType"] == "T" || pRows[2][subIndx]["subType"] == "E") {
                let lstUniqueSemester = lstStudent.map(function (obj) { return obj.semester });
                lstUniqueSemester = lstUniqueSemester.filter((value, index, self) => self.map(x => x).indexOf(value) == index)

                // To calculate 50% of mark from all previous semester (I-VII sem) passed subjects
                let strTotalEarnedCredits = 0, strTotalSubCredits = 0;

                for (let semIndx = 0; semIndx < lstUniqueSemester.length - 1; semIndx++) {
                    let lstMark = lstStudent.filter(function (item) {
                        return item['semester'] == lstUniqueSemester[semIndx] && item["grade"] != "RA" && item["grade"] != null && item["grade"] != "UA" && item["grade"] != "U" && item["grade"] != "AB";
                    })

                    let strSemTotalEarnedCredits = 0, strSemTotalSubCredits = 0;
                    for (let mrkIndx = 0; mrkIndx < lstMark.length; mrkIndx++) {
                        strSemTotalSubCredits = strSemTotalSubCredits + lstMark[mrkIndx]["subCredit"];
                        strSemTotalEarnedCredits = strSemTotalEarnedCredits + (lstMark[mrkIndx]["subCredit"] * __GetGradePoint(lstGrades, lstMark[mrkIndx]["grade"]));
                    }

                    strTotalEarnedCredits = strTotalEarnedCredits + strSemTotalEarnedCredits;
                    strTotalSubCredits = strTotalSubCredits + strSemTotalSubCredits;
                }

                objStudent["CGPA upto Pre-Final Semester"] = {
                    "Overall CGPA": Number(parseFloat(strTotalEarnedCredits / strTotalSubCredits).toFixed(3)),
                    "50%": Number(parseFloat(((strTotalEarnedCredits / strTotalSubCredits) / 10) * 50).toFixed(2))
                };

                //To calculate 20% of IAT mark Internals
                let lstIATMark = pRows[1].filter(obj => {
                    return obj.registerNo == lstUniqueStudents[stuIndx]["registerNo"] && obj.subCode == pRows[2][subIndx]['subCode']
                })

                let objInternal = {};
                let strTotal = __BestOfTwoIAT(lstIATMark, objInternal)

                objStudent["Internal"] = {
                    ...objInternal, ... {
                        "Total Of 2 IAT": strTotal,
                        "Best of 2 IAT-20%": parseFloat((strTotal / 200) * 20).toFixed(2) // calculate average of best two mark as 100% 
                    }
                };

                //TODO (30% from online exam table)
                let lstOnlineMark = pRows[4].filter(obj => { return obj["subCode"] == pRows[2][subIndx]["subCode"] && obj["registerNo"] == lstUniqueStudents[stuIndx]["registerNo"] });
                if (lstOnlineMark.length > 0) {
                    objStudent["Online Exam"] = {
                        "Mark": lstOnlineMark[0]["mark"],
                        "30%": (lstOnlineMark[0]["mark"] == -1) ? 0 : lstOnlineMark[0]["mark"] // if student absent, mark  
                    };
                }
                else {
                    objStudent["Online Exam"] = {
                        "Mark": 0,
                        "30%": 0
                    };
                }

                objStudent["Total of 100%"] = Math.round(Number(objStudent["CGPA upto Pre-Final Semester"]["50%"]) + Number(objStudent["Internal"]["Best of 2 IAT-20%"]) + Number(objStudent["Online Exam"]["30%"]));
                let stuGrade = __GetGrade(pRows[3], objStudent["Total of 100%"], lstUniqueStudents[stuIndx]["regulation"]);
                objStudent["Grade"] = stuGrade["grade"];
                objStudent["GradePoint"] = stuGrade["grade_point"];
                lstStudents.push(objStudent);

                __CountGrade(objGrade, objStudent["Grade"]);
                __AddOverallStatusFinalYear(lstOverAllStatus, lstUniqueStudents[stuIndx]["registerNo"], lstUniqueStudents[stuIndx]["studentName"], pRows[2][subIndx]['subCode'], pRows[2][subIndx]['subCredit'], objStudent["Total of 100%"], stuGrade);

            } else if (pRows[2][subIndx]["subType"] == "J") {
                /**
                 * 20% - internal from project review
                 * 80% - external from project viva
                 */
                // External mark of project viva 80 %
                let arrProjStudents = pRows[0].filter(obj => { return obj.subCode == pRows[2][subIndx]["subCode"] && obj.registerNo == lstUniqueStudents[stuIndx]["registerNo"] });
                objStudent["External Marks(100)"] = (arrProjStudents[0]["extMark"] == -1) ? 'AB' : arrProjStudents[0]["extMark"];
                let strExternalMark = (arrProjStudents[0]["extMark"] == -1) ? 0 : arrProjStudents[0]["extMark"];
                objStudent["80%"] = Number(parseFloat((strExternalMark / 100) * 80).toFixed(2));

                // project review 20%
                let lstIATMark = pRows[1].filter(obj => { return obj.registerNo == lstUniqueStudents[stuIndx]["registerNo"] && obj.subCode == pRows[2][subIndx]["subCode"] })
                if (lstIATMark.length > 0) {
                    let strTotal = __BestOfTwoIAT(lstIATMark, objStudent)

                    objStudent["Total of Best 2 Reviews"] = strTotal
                    objStudent["20% of Best 2 Reviews"] = Number(parseFloat((strTotal / 200) * 20).toFixed(2)); // calculate average of best two mark as 100% 

                    objStudent["Total of 100"] = Math.round(objStudent["80%"] + objStudent["20% of Best 2 Reviews"]);
                    let stuGrade = __GetGrade(pRows[3], objStudent["Total of 100"], lstUniqueStudents[stuIndx]["regulation"]);
                    objStudent["Grade"] = stuGrade["grade"];

                    lstStudents.push(objStudent);
                    __CountGrade(objGrade, objStudent["Grade"]);
                    __AddOverallStatusFinalYear(lstOverAllStatus, lstUniqueStudents[stuIndx]['registerNo'], lstUniqueStudents[stuIndx]['stuName'], pRows[2][subIndx]['subCode'], pRows[2][subIndx]['subCredit'], objStudent["Total of 100"], stuGrade);
                }
            }
            // To count subwise passcount
            if (objStudent["Grade"] == "RA" || objStudent["Grade"] == "UA" || objStudent["Grade"] == "U" || objStudent["Grade"] == "AB") {
                if (arrSubwiseFailureCount.indexOf(lstUniqueStudents[stuIndx]["registerNo"]) < 0)
                    arrSubwiseFailureCount.push(lstUniqueStudents[stuIndx]["registerNo"]);
            }
            // To count overall subject passcount (all pass count)
            if (objStudent["Grade"] == "RA" || objStudent["Grade"] == "UA" || objStudent["Grade"] == "U" || objStudent["Grade"] == "AB") {
                if (arrOverallFailureCount.indexOf(lstUniqueStudents[stuIndx]["registerNo"]) < 0)
                    arrOverallFailureCount.push(lstUniqueStudents[stuIndx]["registerNo"]);
            }
        }

        // overall grade count report 
        for (let key in objGrade) {
            let arrTmp = lstOverallGradeCount.filter(item => { return item["Grade"] == key });
            if (arrTmp.length > 0) {
                arrTmp[0][pRows[2][subIndx]['subCode']] = objGrade[key];
            }
            else {
                let obj = { "Grade": key }
                obj[pRows[2][subIndx]['subCode']] = objGrade[key]
                lstOverallGradeCount.push(obj);
            }
        }

        let strSubTypeExpansion = "";
        if (pRows[2][subIndx]['subType'] == "T")
            strSubTypeExpansion = "Theory"
        else if (pRows[2][subIndx]['subType'] == "P")
            strSubTypeExpansion = "Practical"
        else if (pRows[2][subIndx]['subType'] == "J")
            strSubTypeExpansion = "Project"
        else if (pRows[2][subIndx]['subType'] == "C")
            strSubTypeExpansion = "Theory Cum Practical"
        else if (pRows[2][subIndx]['subType'] == "E")
            strSubTypeExpansion = "Elective"

        lstSubjects.push({
            "SubjectCode": pRows[2][subIndx]["subCode"],
            "SubjectName": pRows[2][subIndx]["subName"],
            "SubjectTypeAcr": pRows[2][subIndx]["subType"],
            "SubjectType": strSubTypeExpansion,
            "SubjectCredit": pRows[2][subIndx]["subCredit"],
            "StudentList": lstStudents
        })

        lstSubWisePassPercentage.push({
            "subCode": pRows[2][subIndx]['subCode'],
            "subName": pRows[2][subIndx]['subName'],
            "studentsReg": lstUniqueStudents.length,
            "studentsPassed": (lstUniqueStudents.length - arrSubwiseFailureCount.length),
            "pass%": parseFloat(((lstUniqueStudents.length - arrSubwiseFailureCount.length) / lstUniqueStudents.length) * 100).toFixed(2)
        })
    }

    // To change the property order "ArearCount to Last"
    for (let k = 0; k < lstOverAllStatus.length; k++) {
        let strArearCount = lstOverAllStatus[k]['ArrearCount'];
        delete lstOverAllStatus[k]['ArrearCount'];
        lstOverAllStatus[k]['ArrearCount'] = strArearCount;
        lstOverAllStatus[k]['GPA'] = parseFloat(isNaN(lstOverAllStatus[k]["sumofEarnedCredit"] / lstOverAllStatus[k]["sumofSubCredit"]) ? 0 : (lstOverAllStatus[k]["sumofEarnedCredit"] / lstOverAllStatus[k]["sumofSubCredit"])).toFixed(3);
        delete lstOverAllStatus[k]['sumofEarnedCredit'];
        delete lstOverAllStatus[k]['sumofSubCredit'];
    }

    // Overall GPA count report
    let objGPACount = {};
    let arrGpaRange = [{ "from": 9.1, "to": 10.0 }, { "from": 8.1, "to": 9.0 }, { "from": 7.1, "to": 8.0 }, { "from": 6.1, "to": 7.0 }, { "from": 5.1, "to": 6.0 }, { "from": 0, "to": 5.0 }];
    for (let i = 0; i < arrGpaRange.length; i++) {
        let lstTmp = lstOverAllStatus.filter(obj => {
            return (obj["GPA"] >= arrGpaRange[i]['from'] && obj["GPA"] <= arrGpaRange[i]['to']);
        });
        let strKey = arrGpaRange[i]["from"].toString() + "-" + arrGpaRange[i]["to"].toString();
        objGPACount[strKey] = lstTmp.length;
    }

    lstSubjects.push({
        "SubjectCode": "Overall Results",
        "SubjectTypeAcr": "O",
        "GPA": objGPACount,
        "GradeList": lstOverallGradeCount,
        "PassList": {
            "totalStuReg": lstTotalStudents.length,
            "totalPass": (lstTotalStudents.length - arrOverallFailureCount.length),
            "overallPass%": parseFloat(((lstTotalStudents.length - arrOverallFailureCount.length) / lstTotalStudents.length) * 100).toFixed(2),
            "subwisePass%": lstSubWisePassPercentage
        },
        "StudentList": lstOverAllStatus
    })
    return lstSubjects;
}

module.exports.PrepareFinalyearPGMarkCalculationOnetime = (pRows) => {

    if (pRows[0].length > 0) {
        let strCurSemester = pRows[0][0]["semester"];

        let strMaxSemester;
        if (pRows[2].length > 0)
            strMaxSemester = pRows[2][0]["maxSem"]

        if (strCurSemester == strMaxSemester) {

            let lstSubjects = [], lstOverAllStatus = [], arrOverallFailureCount = [],
                lstOverallGradeCount = [], lstSubWisePassPercentage = [];

            // To prepare the grade object based on regulation
            let lstGrades = pRows[3].filter(function (obj) {
                return obj.regulation == pRows[0][0]["regulation"]
            });

            let lstTotalStudents = pRows[0].map(function (obj) { return obj.registerNo });
            lstTotalStudents = lstTotalStudents.filter((value, index, self) => self.map(x => x).indexOf(value) == index)

            // To get unique subject
            let lstUniqueSubject = pRows[0].map(function (obj) { return { "subCode": obj.subCode, "subName": obj.subName, "subType": obj.subType, "subCredit": obj.subCredit }; });
            lstUniqueSubject = lstUniqueSubject.filter((value, index, self) => self.map(x => x.subCode).indexOf(value.subCode) == index)

            for (let subIndx = 0; subIndx < lstUniqueSubject.length; subIndx++) {
                let arrSubwiseFailureCount = [], objGrade = {};

                for (let grdIndx = 0; grdIndx < lstGrades.length; grdIndx++) {
                    objGrade[lstGrades[grdIndx]['grade']] = 0
                }

                let arrSubStudents = pRows[0].filter(function (item) {
                    return item['subCode'] == lstUniqueSubject[subIndx]['subCode']
                })

                let lstUniqueStudents = arrSubStudents.map(function (obj) { return { "registerNo": obj.registerNo, "studentName": obj.studentName, "regulation": obj.regulation }; });
                lstUniqueStudents = lstUniqueStudents.filter((value, index, self) => self.map(x => x.registerNo).indexOf(value.registerNo) == index)

                let lstStudents = [];
                for (let stuIndx = 0; stuIndx < lstUniqueStudents.length; stuIndx++) {
                    let objStudent = {
                        "Register No": lstUniqueStudents[stuIndx]["registerNo"],
                        "Student Name": lstUniqueStudents[stuIndx]["studentName"]
                    }

                    if (lstUniqueSubject[subIndx]["subType"] == "J") {
                        /**
                         * 20% - internal from project review
                         * 80% - external from project viva
                         */
                        // External mark of project viva 80 %
                        let arrProjStudents = arrSubStudents.filter(obj => { return obj.registerNo == lstUniqueStudents[stuIndx]["registerNo"] });
                        objStudent["External Marks(100)"] = (arrProjStudents[0]["extMark"] == -1) ? 'AB' : arrProjStudents[0]["extMark"];
                        let strExternalMark = (arrProjStudents[0]["extMark"] == -1) ? 0 : arrProjStudents[0]["extMark"];
                        objStudent["80%"] = Number(parseFloat((strExternalMark / 100) * 80).toFixed(2));

                        // project review 20%
                        let lstIATMark = pRows[1].filter(obj => { return obj.registerNo == lstUniqueStudents[stuIndx]["registerNo"] && obj.subCode == lstUniqueSubject[subIndx]["subCode"] })
                        if (lstIATMark.length > 0) {
                            let strTotal = __BestOfTwoIAT(lstIATMark, objStudent)

                            objStudent["Total of Best 2 Reviews"] = strTotal
                            objStudent["20% of Best 2 Reviews"] = Number(parseFloat((strTotal / 200) * 20).toFixed(2)); // calculate average of best two mark as 100% 

                            objStudent["Total of 100"] = Math.round(objStudent["80%"] + objStudent["20% of Best 2 Reviews"]);
                            let stuGrade = __GetGrade(pRows[3], objStudent["Total of 100"], lstUniqueStudents[stuIndx]["regulation"]);
                            objStudent["Grade"] = stuGrade["grade"];
                            objStudent["GradePoint"] = stuGrade["grade_point"];

                            lstStudents.push(objStudent);
                            __CountGrade(objGrade, objStudent["Grade"]);
                            __AddOverallStatusFinalYear(lstOverAllStatus, lstUniqueStudents[stuIndx]['registerNo'], lstUniqueStudents[stuIndx]['studentName'], lstUniqueSubject[subIndx]['subCode'], lstUniqueSubject[subIndx]['subCredit'], objStudent["Total of 100"], stuGrade);
                        }
                    }
                    // To count subwise passcount
                    if (objStudent["Grade"] == "RA" || objStudent["Grade"] == "UA" || objStudent["Grade"] == "U" || objStudent["Grade"] == "AB") {
                        if (arrSubwiseFailureCount.indexOf(lstUniqueStudents[stuIndx]["registerNo"]) < 0)
                            arrSubwiseFailureCount.push(lstUniqueStudents[stuIndx]["registerNo"]);
                    }
                    // To count overall subject passcount (all pass count)
                    if (objStudent["Grade"] == "RA" || objStudent["Grade"] == "UA" || objStudent["Grade"] == "U" || objStudent["Grade"] == "AB") {
                        if (arrOverallFailureCount.indexOf(lstUniqueStudents[stuIndx]["registerNo"]) < 0)
                            arrOverallFailureCount.push(lstUniqueStudents[stuIndx]["registerNo"]);
                    }
                }

                // overall grade count report 
                for (let key in objGrade) {
                    let arrTmp = lstOverallGradeCount.filter(item => { return item["Grade"] == key });
                    if (arrTmp.length > 0) {
                        arrTmp[0][lstUniqueSubject[subIndx]['subCode']] = objGrade[key];
                    }
                    else {
                        let obj = { "Grade": key }
                        obj[lstUniqueSubject[subIndx]['subCode']] = objGrade[key]
                        lstOverallGradeCount.push(obj);
                    }
                }

                let strSubTypeExpansion = "";
                if (lstUniqueSubject[subIndx]['subType'] == "T")
                    strSubTypeExpansion = "Theory"
                else if (lstUniqueSubject[subIndx]['subType'] == "P")
                    strSubTypeExpansion = "Practical"
                else if (lstUniqueSubject[subIndx]['subType'] == "J")
                    strSubTypeExpansion = "Project"
                else if (lstUniqueSubject[subIndx]['subType'] == "C")
                    strSubTypeExpansion = "Theory Cum Practical"
                else if (lstUniqueSubject[subIndx]['subType'] == "E")
                    strSubTypeExpansion = "Elective"

                lstSubjects.push({
                    "SubjectCode": lstUniqueSubject[subIndx]["subCode"],
                    "SubjectName": lstUniqueSubject[subIndx]["subName"],
                    "SubjectTypeAcr": lstUniqueSubject[subIndx]["subType"],
                    "SubjectType": strSubTypeExpansion,
                    "SubjectCredit": lstUniqueSubject[subIndx]["subCredit"],
                    "StudentList": lstStudents
                })

                lstSubWisePassPercentage.push({
                    "subCode": lstUniqueSubject[subIndx]['subCode'],
                    "subName": lstUniqueSubject[subIndx]['subName'],
                    "studentsReg": lstUniqueStudents.length,
                    "studentsPassed": (lstUniqueStudents.length - arrSubwiseFailureCount.length),
                    "pass%": parseFloat(((lstUniqueStudents.length - arrSubwiseFailureCount.length) / lstUniqueStudents.length) * 100).toFixed(2)
                })
            }

            // To change the property order "ArearCount to Last"
            for (let k = 0; k < lstOverAllStatus.length; k++) {
                let strArearCount = lstOverAllStatus[k]['ArrearCount'];
                delete lstOverAllStatus[k]['ArrearCount'];
                lstOverAllStatus[k]['ArrearCount'] = strArearCount;
                lstOverAllStatus[k]['GPA'] = parseFloat(isNaN(lstOverAllStatus[k]["sumofEarnedCredit"] / lstOverAllStatus[k]["sumofSubCredit"]) ? 0 : (lstOverAllStatus[k]["sumofEarnedCredit"] / lstOverAllStatus[k]["sumofSubCredit"])).toFixed(3);
                delete lstOverAllStatus[k]['sumofEarnedCredit'];
                delete lstOverAllStatus[k]['sumofSubCredit'];
            }

            // Overall GPA count report
            let objGPACount = {};
            let arrGpaRange = [{ "from": 9.1, "to": 10.0 }, { "from": 8.1, "to": 9.0 }, { "from": 7.1, "to": 8.0 }, { "from": 6.1, "to": 7.0 }, { "from": 5.1, "to": 6.0 }, { "from": 0, "to": 5.0 }];
            for (let i = 0; i < arrGpaRange.length; i++) {
                let lstTmp = lstOverAllStatus.filter(obj => {
                    return (obj["GPA"] >= arrGpaRange[i]['from'] && obj["GPA"] <= arrGpaRange[i]['to']);
                });
                let strKey = arrGpaRange[i]["from"].toString() + "-" + arrGpaRange[i]["to"].toString();
                objGPACount[strKey] = lstTmp.length;
            }

            lstSubjects.push({
                "SubjectCode": "Overall Results",
                "SubjectTypeAcr": "O",
                "GPA": objGPACount,
                "GradeList": lstOverallGradeCount,
                "PassList": {
                    "totalStuReg": lstTotalStudents.length,
                    "totalPass": (lstTotalStudents.length - arrOverallFailureCount.length),
                    "overallPass%": parseFloat(((lstTotalStudents.length - arrOverallFailureCount.length) / lstTotalStudents.length) * 100).toFixed(2),
                    "subwisePass%": lstSubWisePassPercentage
                },
                "StudentList": lstOverAllStatus
            })
            return { "blnPGFinalYear": true, "subjectList": lstSubjects };
        }
        else {
            return { "blnPGFinalYear": false, "subjectList": [] };
        }
    }
}

function __GetGradePoint(pGradeRows, pGrade) {
    let strGrade = 0;
    let arrGrade = pGradeRows.filter(function (item) {
        return item['grade'] == pGrade
    })
    if (arrGrade.length > 0) {
        strGrade = arrGrade[0]["grade_point"]
    }
    return Number(strGrade);
}

function __AddOverallStatusFinalYear(pLstOverallStatus, pRegisterNo, pStuName, pSubCode, pSubCredit, pTotalMark, pGrade) {
    let tmp = pLstOverallStatus.filter(obj => { return obj["Register No"] == pRegisterNo })
    if (tmp.length > 0) {
        tmp[0][pSubCode] = { "Total": pTotalMark, "Grade": pGrade["grade"] };
        tmp[0]['ArrearCount'] = ((pGrade["grade"] == 'RA' || pGrade["grade"] == 'UA' || pGrade["grade"] == 'U' || pGrade["grade"] == 'AB') ? tmp[0]['ArrearCount'] + 1 : tmp[0]['ArrearCount'])

        tmp[0]["sumofEarnedCredit"] = tmp[0]["sumofEarnedCredit"] + (pSubCredit * pGrade["grade_point"]);
        tmp[0]["sumofSubCredit"] = tmp[0]["sumofSubCredit"] + ((pGrade["grade"] == 'RA' || pGrade["grade"] == 'UA' || pGrade["grade"] == 'U' || pGrade["grade"] == 'AB') ? 0 : pSubCredit);
    } else {
        let obj = {
            "Register No": pRegisterNo,
            "Student Name": pStuName
        }
        obj['ArrearCount'] = 0;
        obj["sumofEarnedCredit"] = 0;
        obj["sumofSubCredit"] = 0;
        obj[pSubCode] = { "Total": pTotalMark, "Grade": pGrade["grade"] }
        obj['ArrearCount'] = ((pGrade["grade"] == 'RA' || pGrade["grade"] == 'UA' || pGrade["grade"] == 'U' || pGrade["grade"] == 'AB') ? obj['ArrearCount'] + 1 : obj['ArrearCount'])
        obj["sumofEarnedCredit"] = obj["sumofEarnedCredit"] + (pSubCredit * pGrade["grade_point"]);
        obj["sumofSubCredit"] = obj["sumofSubCredit"] + ((pGrade["grade"] == 'RA' || pGrade["grade"] == 'UA' || pGrade["grade"] == 'U' || pGrade["grade"] == 'AB') ? 0 : pSubCredit);
        pLstOverallStatus.push(obj);
    }
}

module.exports.CalculateExternalMarkJson = (pRows) => {
    let lstPrevExternalMark = [];
    let lstStudents = [];

    let arrStudents = pRows[1].map(function (obj) { return { "registerNo": obj.registerNo, "stuName": obj.stuName, "semester": obj.semester, "regulation": obj.regulation }; });
    arrStudents = arrStudents.filter((value, index, self) => self.map(x => x.registerNo).indexOf(value.registerNo) == index)

    let strRegulation = pRows[1][0]['regulation'];

    for (let subIndx = 0; subIndx < pRows[3].length; subIndx++) {

        let strSubType = pRows[3][subIndx]['subType'];

        for (let stuIndx = 0; stuIndx < arrStudents.length; stuIndx++) {
            let objStudent = { "registerNo": arrStudents[stuIndx]["registerNo"], "stuName": arrStudents[stuIndx]["stuName"], "subType": strSubType }

            if (strRegulation == "R2017") {
                if (strSubType == "T") {

                    /** Prev university theory              - 30%
                     *  current Sem IAT sum(max of 2 IAT)   - 70%
                     */

                    // To get previous semester university external mark 
                    let lstPrevUnivMark = pRows[0].filter(obj => { return obj['registerNo'] == arrStudents[stuIndx]['registerNo'] })

                    let tmp = lstPrevExternalMark.filter(obj => { obj.registerNo == arrStudents[stuIndx]['registerNo'] })
                    if (tmp.length > 0) {
                        objStudent["Conversion of Theory Externals - ODD SEM (March / April 2020)"] = tmp[0]['prevMark'];
                    } else {
                        objStudent["Conversion of Theory Externals - ODD SEM (March / April 2020)"] = __GetPrevTheoryExternal(lstPrevUnivMark, lstPrevExternalMark);
                    }

                    // To get current semester IAT mark
                    let lstIATMark = pRows[1].filter(obj => { return obj.registerNo == arrStudents[stuIndx]["registerNo"] && obj.subCode == pRows[3][subIndx]["subCode"] })

                    let strTotal = __BestOfTwoIAT(lstIATMark, objStudent)

                    objStudent["Total Of 2 IAT"] = strTotal
                    let str100mark = (strTotal / 2) // calculate average of best two IAT mark as 100 %
                    objStudent["70% of IAT"] = parseFloat((str100mark / 100) * 70).toFixed(2)  // calculate 70 % 
                    objStudent["Total"] = Math.round(parseFloat(objStudent["Conversion of Theory Externals - ODD SEM (March / April 2020)"]['30%']) + parseFloat(objStudent["70% of IAT"]))  // 30%+70%
                    let stuGrade = __GetGrade(pRows[4], objStudent["Total"], arrStudents[stuIndx]["regulation"]);
                    objStudent["Grade"] = stuGrade["grade"];
                    objStudent["GradePoint"] = stuGrade["grade_point"];
                    objStudent["intMark"] = __CalculateInternalMark(objStudent["70% of IAT"], 70, 20);

                    __PushObject(lstStudents, objStudent, pRows[3][subIndx]["subCode"], strRegulation);
                } else if (strSubType == "E" || strSubType == "J") {
                    // To get current semester IAT mark
                    let lstIATMark = pRows[1].filter(obj => { return obj.registerNo == arrStudents[stuIndx]["registerNo"] && obj.subCode == pRows[3][subIndx]["subCode"] })
                    if (lstIATMark.length > 0) {
                        let strTotal = __BestOfTwoIAT(lstIATMark, objStudent)
                        let stuGrade = {};
                        if (strSubType == "E") {
                            objStudent["Total Of 2 IAT"] = strTotal
                            objStudent["100% of IAT"] = Math.round((strTotal / 2)) // calculate average of best two mark as 100% 
                            objStudent["Total"] = objStudent["100% of IAT"];
                            stuGrade = __GetGrade(pRows[4], objStudent["100% of IAT"], arrStudents[stuIndx]["regulation"]);
                            objStudent["Grade"] = stuGrade["grade"];
                            objStudent["GradePoint"] = stuGrade["grade_point"];
                            objStudent["intMark"] = __CalculateInternalMark(objStudent["100% of IAT"], 100, 20);
                        } else {
                            objStudent["Total Of 2 Review"] = strTotal
                            objStudent["100% of Review"] = Math.round((strTotal / 2)); // calculate average of best two mark as 100% 
                            objStudent["Total"] = objStudent["100% of Review"];
                            stuGrade = __GetGrade(pRows[4], objStudent["100% of Review"], arrStudents[stuIndx]["regulation"]);
                            objStudent["Grade"] = stuGrade["grade"];
                            objStudent["GradePoint"] = stuGrade["grade_point"];
                            objStudent["intMark"] = __CalculateInternalMark(objStudent["100% of Review"], 100, 20);
                        }
                        __PushObject(lstStudents, objStudent, pRows[3][subIndx]["subCode"], strRegulation);
                    }
                } else if (strSubType == "P") {

                    // To get current semester lab experiment mark
                    let lstLabExprMark = pRows[2].filter(obj => { return obj.registerNo == arrStudents[stuIndx]["registerNo"] && obj.subCode == pRows[3][subIndx]["subCode"] })

                    __CalculateLabExperimentMark(lstLabExprMark, objStudent);

                    objStudent["Total Converted To 100"] = Math.round(objStudent["Total Converted To 100"]);
                    objStudent["Total"] = objStudent["Total Converted To 100"];
                    let stuGrade = __GetGrade(pRows[4], objStudent["Total Converted To 100"], arrStudents[stuIndx]["regulation"]);
                    objStudent["Grade"] = stuGrade["grade"];
                    objStudent["GradePoint"] = stuGrade["grade_point"];
                    objStudent["intMark"] = __CalculateInternalMark(objStudent["Total Converted To 100"], 100, 20);

                    __PushObject(lstStudents, objStudent, pRows[3][subIndx]["subCode"], strRegulation);
                } else if (strSubType == "C") {

                    // To get current semester IAT mark
                    let lstIATMark = pRows[1].filter(obj => { return obj.registerNo == arrStudents[stuIndx]["registerNo"] && obj.subCode == pRows[3][subIndx]["subCode"] })

                    let strTotal = __BestOfTwoIAT(lstIATMark, objStudent)

                    objStudent["Total Of 2 IAT"] = strTotal
                    let str100mark = (strTotal / 2) // calculate average of best two IAT mark as 100 %
                    objStudent["70% of IAT"] = parseFloat((str100mark / 100) * 70).toFixed(2)  // calculate 70 %

                    // To get current semester lab experiment mark
                    let lstLabExprMark = pRows[2].filter(obj => { return obj.registerNo == arrStudents[stuIndx]["registerNo"] && obj.subCode == pRows[3][subIndx]["subCode"] })

                    __CalculateLabExperimentMark(lstLabExprMark, objStudent);

                    objStudent["30% of ExpMarks"] = parseFloat((objStudent["Total Converted To 100"] / 100) * 30).toFixed(2);

                    objStudent["Total"] = Math.round(parseFloat(objStudent["30% of ExpMarks"]) + parseFloat(objStudent["70% of IAT"]))  // 30%+70%
                    let stuGrade = __GetGrade(pRows[4], objStudent["Total"], arrStudents[stuIndx]["regulation"]);
                    objStudent["Grade"] = stuGrade["grade"];
                    objStudent["GradePoint"] = stuGrade["grade_point"];

                    objStudent["intMark"] = __CalculateInternalMark(objStudent["70% of IAT"], 70, 20);

                    __PushObject(lstStudents, objStudent, pRows[3][subIndx]["subCode"], strRegulation);
                }
            } else if (strRegulation == "R2019") {
                if (strSubType == "T") {

                    /** Prev university theory              - 30%
                     *  current Sem IAT sum(max of 2 IAT)   - 70%
                     */

                    // To get previous semester university external mark 
                    let lstPrevUnivMark = pRows[0].filter(obj => { return obj['registerNo'] == arrStudents[stuIndx]['registerNo'] })

                    let tmp = lstPrevExternalMark.filter(obj => { return obj.registerNo == arrStudents[stuIndx]['registerNo'] })
                    if (tmp.length > 0) {
                        objStudent["Conversion of Theory Externals - ODD SEM (March / April 2020)"] = tmp[0]['prevMark'];
                    } else {
                        objStudent["Conversion of Theory Externals - ODD SEM (March / April 2020)"] = __GetPrevTheoryExternal(lstPrevUnivMark, lstPrevExternalMark);
                    }

                    // To get current semester IAT mark                    
                    let lstIATMark = pRows[1].filter(obj => { return obj.registerNo == arrStudents[stuIndx]["registerNo"] && obj.subCode == pRows[3][subIndx]["subCode"] })

                    if (lstIATMark.length > 0) {

                        let str100mark = __CalculateCATAndFAT(lstIATMark, objStudent)

                        objStudent["70% of CAT and FAT"] = parseFloat((str100mark / 100) * 70).toFixed(2)  // calculate 70 %
                        objStudent["Total"] = Math.round(parseFloat(objStudent["Conversion of Theory Externals - ODD SEM (March / April 2020)"]['30%']) + parseFloat(objStudent["70% of CAT and FAT"]))  // 30%+70%
                        let stuGrade = __GetGrade(pRows[4], objStudent["Total"], arrStudents[stuIndx]["regulation"]);
                        objStudent["Grade"] = stuGrade["grade"];
                        objStudent["GradePoint"] = stuGrade["grade_point"];

                        objStudent["intMark"] = __CalculateInternalMark(objStudent["70% of CAT and FAT"], 70, 40);

                        __PushObject(lstStudents, objStudent, pRows[3][subIndx]["subCode"], strRegulation);
                    }
                } else if (strSubType == "E") {
                    // To get current semester IAT mark
                    let lstIATMark = pRows[1].filter(obj => { return obj.registerNo == arrStudents[stuIndx]["registerNo"] && obj.subCode == pRows[3][subIndx]["subCode"] })
                    if (lstIATMark.length > 0) {
                        let strTotal = __CalculateCATAndFAT(lstIATMark, objStudent)

                        objStudent["100% of CAT and FAT"] = Math.round(strTotal) // calculate average of best two mark as 100% 
                        objStudent["Total"] = objStudent["100% of CAT and FAT"];
                        let stuGrade = __GetGrade(pRows[4], objStudent["100% of CAT and FAT"], arrStudents[stuIndx]["regulation"]);
                        objStudent["Grade"] = stuGrade["grade"];
                        objStudent["GradePoint"] = stuGrade["grade_point"];
                        objStudent["intMark"] = __CalculateInternalMark(objStudent["100% of CAT and FAT"], 100, 40);

                        __PushObject(lstStudents, objStudent, pRows[3][subIndx]["subCode"], strRegulation);
                    }
                } else if (strSubType == "P") {

                    // To get current semester lab experiment mark
                    let lstLabExprMark = pRows[2].filter(obj => { return obj.registerNo == arrStudents[stuIndx]["registerNo"] && obj.subCode == pRows[3][subIndx]["subCode"] })

                    __CalculateLabExperimentMark(lstLabExprMark, objStudent);

                    objStudent["Total Converted To 100"] = Math.round(objStudent["Total Converted To 100"]);
                    objStudent["Total"] = objStudent["Total Converted To 100"];
                    let stuGrade = __GetGrade(pRows[4], objStudent["Total Converted To 100"], arrStudents[stuIndx]["regulation"]);
                    objStudent["Grade"] = stuGrade["grade"];
                    objStudent["GradePoint"] = stuGrade["grade_point"];
                    objStudent["intMark"] = __CalculateInternalMark(objStudent["Total Converted To 100"], 100, 40);

                    __PushObject(lstStudents, objStudent, pRows[3][subIndx]["subCode"], strRegulation);
                } else if (strSubType == "C") {
                    // To get current semester IAT mark
                    let lstIATMark = pRows[1].filter(obj => { return obj.registerNo == arrStudents[stuIndx]["registerNo"] && obj.subCode == pRows[3][subIndx]["subCode"] })

                    let str100mark = __CalculateCATAndFAT(lstIATMark, objStudent)

                    objStudent["70% of CAT and FAT"] = parseFloat((str100mark / 100) * 70).toFixed(2)  // calculate 70 %

                    // To get current semester lab experiment mark
                    let lstLabExprMark = pRows[2].filter(obj => { return obj.registerNo == arrStudents[stuIndx]["registerNo"] && obj.subCode == pRows[3][subIndx]["subCode"] })

                    __CalculateLabExperimentMark(lstLabExprMark, objStudent);

                    objStudent["30% of ExpMarks"] = parseFloat((objStudent["Total Converted To 100"] / 100) * 30).toFixed(2);

                    objStudent["Total"] = Math.round(parseFloat(objStudent["30% of ExpMarks"]) + parseFloat(objStudent["70% of CAT and FAT"]))  // 30%+70%
                    let stuGrade = __GetGrade(pRows[4], objStudent["Total"], arrStudents[stuIndx]["regulation"]);
                    objStudent["Grade"] = stuGrade["grade"];
                    objStudent["GradePoint"] = stuGrade["grade_point"];
                    objStudent["intMark"] = __CalculateInternalMark(objStudent["70% of CAT and FAT"], 70, 40);

                    __PushObject(lstStudents, objStudent, pRows[3][subIndx]["subCode"], strRegulation);
                } else if (strSubType == "J") {
                    let lstIATMark = pRows[1].filter(obj => { return obj.registerNo == arrStudents[stuIndx]["registerNo"] && obj.subCode == pRows[3][subIndx]["subCode"] })

                    if (lstIATMark.length > 0) {
                        let strTotal = __BestOfTwoIAT(lstIATMark, objStudent)

                        objStudent["Total of Best 2 Reviews"] = strTotal
                        objStudent["100% of Best 2 Reviews"] = Math.round((strTotal / 2)) // calculate average of best two mark as 100% 
                        objStudent["Total"] = objStudent["100% of Best 2 Reviews"];
                        let stuGrade = __GetGrade(pRows[4], objStudent["100% of Best 2 Reviews"], arrStudents[stuIndx]["regulation"]);
                        objStudent["Grade"] = stuGrade["grade"];
                        objStudent["GradePoint"] = stuGrade["grade_point"];
                        objStudent["intMark"] = __CalculateInternalMark(objStudent["100% of Best 2 Reviews"], 100, 40);

                        __PushObject(lstStudents, objStudent, pRows[3][subIndx]["subCode"], strRegulation);
                    }
                }
            }
        }
    }
    return lstStudents;
}

function __CalculateInternalMark(pMark, pDivideBy, pConvertTo) {
    return Math.round((pMark / pDivideBy) * pConvertTo);
}

function __PushObject(pLstStudents, pObjStudent, pSubCode, pRegulation) {
    pLstStudents.push({
        "registerNo": pObjStudent['registerNo'],
        "subCode": pSubCode,
        "subType": pObjStudent['subType'],
        "regulation": pRegulation,
        "intMark": pObjStudent['intMark'],
        "totalMark": pObjStudent['Total'],
        "grade": pObjStudent['Grade'],
        "gradePoint": pObjStudent['GradePoint']
    })
}

module.exports.PrepareAndUpdateFinalYearMarkCalculationOnetime = (pRows) => {

    // To prepare the grade object based on regulation
    let lstGrades = pRows[3].filter(function (obj) {
        return obj.regulation == pRows[0][0]["regulation"]
    });

    let lstTotalStudents = pRows[1].map(function (obj) { return obj.registerNo });
    lstTotalStudents = lstTotalStudents.filter((value, index, self) => self.map(x => x).indexOf(value) == index)
    let lstStudents = [];
    for (let subIndx = 0; subIndx < pRows[2].length; subIndx++) {

        let arrSubStudents = pRows[1].filter(function (item) {
            return item['subCode'] == pRows[2][subIndx]['subCode'] //&& item['section'] == pRows[2][subIndx]['section']
        })

        let lstUniqueStudents = arrSubStudents.map(function (obj) { return { "registerNo": obj.registerNo, "studentName": obj.studentName, "regulation": obj.regulation }; });
        lstUniqueStudents = lstUniqueStudents.filter((value, index, self) => self.map(x => x.registerNo).indexOf(value.registerNo) == index)

        for (let stuIndx = 0; stuIndx < lstUniqueStudents.length; stuIndx++) {
            let objStudent = {
                "registerNo": lstUniqueStudents[stuIndx]["registerNo"],
                "studentName": lstUniqueStudents[stuIndx]["studentName"]
            }
            let lstStudent = pRows[0].filter(function (item) {
                return item['registerNo'] == lstUniqueStudents[stuIndx]['registerNo']
            })

            if (pRows[2][subIndx]["subType"] == "T" || pRows[2][subIndx]["subType"] == "E") {

                let lstUniqueSemester = lstStudent.map(function (obj) { return obj.semester });
                lstUniqueSemester = lstUniqueSemester.filter((value, index, self) => self.map(x => x).indexOf(value) == index)

                // To calculate 50% of mark from all previous semester (I-VII sem) passed subjects
                let strTotalEarnedCredits = 0, strTotalSubCredits = 0;

                for (let semIndx = 0; semIndx < lstUniqueSemester.length - 1; semIndx++) {
                    let lstMark = lstStudent.filter(function (item) {
                        return item['semester'] == lstUniqueSemester[semIndx] && item["grade"] != null && item["grade"] != "RA" && item["grade"] != "UA" && item["grade"] != "U" && item["grade"] != "AB";
                    })

                    let strSemTotalEarnedCredits = 0, strSemTotalSubCredits = 0;
                    for (let mrkIndx = 0; mrkIndx < lstMark.length; mrkIndx++) {
                        strSemTotalSubCredits = strSemTotalSubCredits + lstMark[mrkIndx]["subCredit"];
                        strSemTotalEarnedCredits = strSemTotalEarnedCredits + (lstMark[mrkIndx]["subCredit"] * __GetGradePoint(lstGrades, lstMark[mrkIndx]["grade"]));
                    }

                    strTotalEarnedCredits = strTotalEarnedCredits + strSemTotalEarnedCredits;
                    strTotalSubCredits = strTotalSubCredits + strSemTotalSubCredits;
                }

                objStudent["CGPA upto Pre-Final Semester"] = {
                    "Overall CGPA": Number(parseFloat(strTotalEarnedCredits / strTotalSubCredits).toFixed(3)),
                    "50%": Number(parseFloat(((strTotalEarnedCredits / strTotalSubCredits) / 10) * 50).toFixed(2))
                };

                //To calculate 20% of IAT mark Internals
                let lstIATMark = pRows[1].filter(obj => {
                    return obj.registerNo == lstUniqueStudents[stuIndx]["registerNo"] && obj.subCode == pRows[2][subIndx]['subCode']
                })

                let objInternal = {};
                let strTotal = __BestOfTwoIAT(lstIATMark, objInternal)

                objStudent["Internal"] = {
                    ...objInternal, ... {
                        "Total Of 2 IAT": strTotal,
                        "Best of 2 IAT-20%": parseFloat((strTotal / 200) * 20).toFixed(2) // calculate average of best two mark as 100% 
                    }
                };

                //TODO (30% from online exam table)
                let lstOnlineMark = pRows[4].filter(obj => { return obj["subCode"] == pRows[2][subIndx]["subCode"] && obj["registerNo"] == lstUniqueStudents[stuIndx]["registerNo"] });
                if (lstOnlineMark.length > 0) {
                    objStudent["Online Exam"] = {
                        "Mark": lstOnlineMark[0]["mark"],
                        "30%": (lstOnlineMark[0]["mark"] == -1) ? 0 : lstOnlineMark[0]["mark"] // if student absent, mark  
                    };
                }
                else {
                    objStudent["Online Exam"] = {
                        "Mark": 0,
                        "30%": 0
                    };
                }

                objStudent["totalMark"] = Math.round(Number(objStudent["CGPA upto Pre-Final Semester"]["50%"]) + Number(objStudent["Internal"]["Best of 2 IAT-20%"]) + Number(objStudent["Online Exam"]["30%"]));

                let stuGrade = __GetGrade(pRows[3], objStudent["totalMark"], lstUniqueStudents[stuIndx]["regulation"]);
                objStudent["grade"] = stuGrade["grade"];
                objStudent["gradePoint"] = stuGrade["grade_point"];
                objStudent["subType"] = "T"
                objStudent["subCode"] = pRows[2][subIndx]["subCode"];
                objStudent["regulation"] = pRows[0][0]["regulation"];
                objStudent["intMark"] = Math.round(objStudent["Internal"]["Best of 2 IAT-20%"]);

                delete objStudent["CGPA upto Pre-Final Semester"];
                delete objStudent["Online Exam"];
                delete objStudent["Internal"];

            } else if (pRows[2][subIndx]["subType"] == "J") {
                /**
                 * 20% - internal from project review
                 * 80% - external from project viva
                 */
                // External mark of project viva 80 %
                let arrProjStudents = pRows[0].filter(obj => { return obj.subCode == pRows[2][subIndx]["subCode"] && obj.registerNo == lstUniqueStudents[stuIndx]["registerNo"] });
                objStudent["80%"] = Number(parseFloat((arrProjStudents[0]["extMark"] / 100) * 80).toFixed(2));

                // project review 20%
                let lstIATMark = pRows[1].filter(obj => { return obj.registerNo == lstUniqueStudents[stuIndx]["registerNo"] && obj.subCode == pRows[2][subIndx]["subCode"] })
                if (lstIATMark.length > 0) {
                    let strTotal = __BestOfTwoIAT(lstIATMark, objStudent)

                    objStudent["Total of Best 2 Reviews"] = strTotal
                    objStudent["20% of Best 2 Reviews"] = Number(parseFloat((strTotal / 200) * 20).toFixed(2)); // calculate average of best two mark as 100% 

                    objStudent["intMark"] = objStudent["20% of Best 2 Reviews"];
                    objStudent["totalMark"] = Math.round(objStudent["80%"] + objStudent["20% of Best 2 Reviews"]);
                    let stuGrade = __GetGrade(pRows[3], objStudent["totalMark"], lstUniqueStudents[stuIndx]["regulation"]);
                    objStudent["grade"] = stuGrade["grade"];
                    objStudent["gradePoint"] = stuGrade["grade_point"];
                    objStudent["subCode"] = pRows[2][subIndx]["subCode"];
                    objStudent["subType"] = "J"
                    objStudent["regulation"] = lstUniqueStudents[stuIndx]["regulation"];
                    objStudent["intMark"] = Math.round(objStudent["20% of Best 2 Reviews"]);

                    delete objStudent["Total of Best 2 Reviews"];
                    delete objStudent["20% of Best 2 Reviews"];
                }
            }
            lstStudents.push(objStudent);
        }
    }
    return lstStudents;
}

module.exports.PrepareAndUpdateFinalyearPGMarkCalculation = (pRows) => {
    let lstStudents = [];
    if (pRows[0].length > 0) {

        // To get unique subject
        let lstUniqueSubject = pRows[0].map(function (obj) { return { "subCode": obj.subCode, "subName": obj.subName, "subType": obj.subType }; });
        lstUniqueSubject = lstUniqueSubject.filter((value, index, self) => self.map(x => x.subCode).indexOf(value.subCode) == index)

        for (let subIndx = 0; subIndx < lstUniqueSubject.length; subIndx++) {

            let arrSubStudents = pRows[0].filter(function (item) {
                return item['subCode'] == lstUniqueSubject[subIndx]['subCode']
            })

            let lstUniqueStudents = arrSubStudents.map(function (obj) { return { "registerNo": obj.registerNo, "studentName": obj.studentName, "regulation": obj.regulation }; });
            lstUniqueStudents = lstUniqueStudents.filter((value, index, self) => self.map(x => x.registerNo).indexOf(value.registerNo) == index)

            for (let stuIndx = 0; stuIndx < lstUniqueStudents.length; stuIndx++) {
                let objStudent = {
                    "registerNo": lstUniqueStudents[stuIndx]["registerNo"],
                    "studentName": lstUniqueStudents[stuIndx]["studentName"]
                }

                if (lstUniqueSubject[subIndx]["subType"] == "J") {
                    /**
                     * 20% - internal from project review
                     * 80% - external from project viva
                     */
                    // External mark of project viva 80 %

                    let arrProjStudents = arrSubStudents.filter(function (item) {
                        return item['registerNo'] == lstUniqueStudents[stuIndx]['registerNo'];
                    })
                    let strExternalMark = (arrProjStudents[0]["extMark"] == -1) ? 0 : arrProjStudents[0]["extMark"];
                    objStudent["80%"] = Number(parseFloat((strExternalMark / 100) * 80).toFixed(2));

                    // project review 20%
                    let lstIATMark = pRows[1].filter(obj => { return obj.registerNo == lstUniqueStudents[stuIndx]["registerNo"] && obj.subCode == lstUniqueSubject[subIndx]["subCode"] })
                    if (lstIATMark.length > 0) {
                        let strTotal = __BestOfTwoIAT(lstIATMark, objStudent)

                        // objStudent["Total of Best 2 Reviews"] = strTotal
                        objStudent["20% of Best 2 Reviews"] = Number(parseFloat((strTotal / 200) * 20).toFixed(2)); // calculate average of best two mark as 100% 

                        objStudent["intMark"] = objStudent["20% of Best 2 Reviews"];
                        objStudent["totalMark"] = Math.round(objStudent["80%"] + objStudent["20% of Best 2 Reviews"]);
                        let stuGrade = __GetGrade(pRows[3], objStudent["totalMark"], lstUniqueStudents[stuIndx]["regulation"]);
                        objStudent["grade"] = stuGrade["grade"];
                        objStudent["gradePoint"] = stuGrade["grade_point"];
                        objStudent["subCode"] = lstUniqueSubject[subIndx]["subCode"];
                        objStudent["subType"] = "J"
                        objStudent["regulation"] = lstUniqueStudents[stuIndx]["regulation"];
                        objStudent["intMark"] = Math.round(objStudent["20% of Best 2 Reviews"]);

                        delete objStudent["Total of Best 2 Reviews"];
                        delete objStudent["20% of Best 2 Reviews"];
                    }
                }
                lstStudents.push(objStudent);
            }// end of student loop
        }// end of subject loop     
    }
    return lstStudents;
}

module.exports.CompareERPMarkWithUnivMark = (pCallback) => {

    let lstMarks = [];
    let wrkBook = new reqExcel.Workbook();
    let filePath = reqPath.resolve(__baseDir, 'AUTONOMOUS_DATA_9528_16B.xlsx');

    wrkBook.xlsx.readFile(filePath).then(function () {

        wrkBook.eachSheet(function (wrkSheet, wrkSheetIndx) {
            let lstColumnHeader = []
            wrkSheet.eachRow({ includeEmpty: true }, function (row, rowNumber) {
                // read row header for json property name
                if (rowNumber == 1) {
                    row.eachCell({ includeEmpty: true }, (cell, rowNumber) => {
                        lstColumnHeader.push(cell.text.toLowerCase().replace(new RegExp(" ", 'g'), "_"));
                    });
                }
                if (rowNumber != 1) { // skip header row
                    let objRow = {};
                    let arrRowValues = [];
                    lstColumnHeader.forEach(function (col, colIndx) {
                        objRow[col] = wrkSheet.getRow(rowNumber).getCell(colIndx + 1).value;
                    })
                    objRow["gradeStatus"] = ""
                    lstMarks.push(objRow);
                }
            })// worksheet row end
        })
    }).then((result) => {
        pCallback(lstMarks);
    })
}

module.exports.CreateExcelOfComparision = (pRows, pCallback) => {
    var workbook = new reqExcel.Workbook();

    workbook.creator = 'Me';
    workbook.lastModifiedBy = 'Her';
    workbook.created = new Date(1985, 8, 30);
    workbook.modified = new Date();
    workbook.lastPrinted = new Date(2016, 9, 27);
    workbook.properties.date1904 = true;

    workbook.views = [
        {
            x: 0, y: 0, width: 10000, height: 20000,
            firstSheet: 0, activeTab: 1, visibility: 'visible', showGridLines: true
        }
    ]

    var worksheet = workbook.addWorksheet('ComparisionofMark', {
        properties: { tabColor: { argb: 'FF00FF00' }, defaultRowHeight: 25, defaultColumnWidth: 30 }, views: [
            { activeTab: 1, visibility: 'visible', /*state: 'frozen', ySplit: 1, */ activeCell: 'A1', showGridLines: true }
        ]
    });

    worksheet.mergeCells('A2:L2');
    var row = worksheet.getRow(2);
    row.getCell(2).value = "Comparision of ERP mark with anna university mark";

    let cols = Object.keys(pRows[0]);

    worksheet.getRow(4).values = ["regnnumb", "studname", "branname", "currsems", "subjuncd", "subjname", "intnmark",
        "ext_mark", "total", "grade", "ERP-IntMark", "ERP-Grade", "intMarkStatus", "gradeStatus"]// cols;

    worksheet.columns = [
        // { key: 'instcode', width: 5 },
        // { key: 'sessions', width: 10 },
        { key: "regnnumb", width: 15 },
        { key: "studname", width: 15 },
        { key: "branname", width: 25 },
        { key: 'currsems', width: 10 },
        // { key: 'subtype', width: 10 },
        { key: 'subjuncd', width: 10 },
        { key: 'subjname', width: 25 },
        { key: 'intnmark', width: 5 },
        { key: "ext_mark", width: 5 },
        { key: "total", width: 10 },
        { key: "grade", width: 10 },
        // { key: "res_stat", width: 10 },
        { key: "ERP-IntMark", width: 10 },
        { key: "ERP-Grade", width: 10 },
        { key: "intMarkStatus", width: 10 },
        { key: "gradeStatus", width: 10 }
    ];

    worksheet.addRows(pRows);

    var borderStyles = {
        top: { style: 'thin', color: { argb: '#0000FF' } },
        left: { style: 'thin', color: { argb: '#0000FF' } },
        bottom: { style: 'thin', color: { argb: '#0000FF' } },
        right: { style: 'thin', color: { argb: '#0000FF' } }
    };

    worksheet.eachRow({ includeEmpty: false }, function (row, rowNumber) {
        row.border = borderStyles;
        row.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
        if (row.getCell("intMarkStatus").value == "Not OK") {
            row.getCell("intnmark").fill = {
                type: 'pattern',
                pattern: 'lightVertical',
                fgColor: { argb: 'FFFF0000' }
            }
            row.getCell("ERP-IntMark").fill = {
                type: 'pattern',
                pattern: 'lightVertical',
                fgColor: { argb: 'FFFF0000' }
            }
            row.getCell("intMarkStatus").fill = {
                type: 'pattern',
                pattern: 'lightVertical',
                fgColor: { argb: 'FFFF0000' }
            }
        }
        if (row.getCell("gradeStatus").value == "Not OK") {
            row.getCell("gradeStatus").fill = {
                type: 'pattern',
                pattern: 'lightVertical',
                fgColor: { argb: '19A102' }
            }
            row.getCell("ERP-Grade").fill = {
                type: 'pattern',
                pattern: 'lightVertical',
                fgColor: { argb: '19A102' }
            }
            row.getCell("grade").fill = {
                type: 'pattern',
                pattern: 'lightVertical',
                fgColor: { argb: '19A102' }
            }
        }
        if (rowNumber == 2) {
            row.alignment = { vertical: "middle", horizontal: "center" }
        }
    });
    // worksheet.commit();
    var strFileName = reqPath.join(__baseDir, 'ComparisionOfERPWithUniversityMark' + new Date().getHours() + new Date().getMinutes() + new Date().getSeconds() + new Date().getMilliseconds() + '.xlsx');

    workbook.xlsx.writeFile(strFileName)
        .then(function (err) {
            console.log("File write success");
            pCallback(err);
        });
}

function __GetGradePoint(pGradeRows, pGrade) {
    let strGrade = 0;
    let arrGrade = pGradeRows.filter(function (item) {
        return item['grade'] == pGrade
    })
    if (arrGrade.length > 0) {
        strGrade = arrGrade[0]["grade_point"]
    }
    return Number(strGrade);
}

/************ College Leave related functions ***************/

module.exports.PrepareLeaveRequisitionObject = (pRows) => {
    let arrReqList = [];
    for (var indx = 0; indx < pRows[0].length; indx++) {
        var arrReqHist = pRows[1].filter(function (leaveReq) {
            return leaveReq['apply_id'] == pRows[0][indx]['applicationId'];
        });

        let objLeaveReqHist = pRows[0][indx];
        if (objLeaveReqHist["alterClass"] && objLeaveReqHist["alterClass"] != "") {
            objLeaveReqHist["alterClass"] = JSON.parse(objLeaveReqHist["alterClass"]).filter(obj => { return obj != "null" && obj != null && obj != "" })
            objLeaveReqHist["alterClass"] = objLeaveReqHist["alterClass"].map(item => item)
                .filter((value, index, self) => self.indexOf(value) === index)
        } else
            objLeaveReqHist["alterClass"] = [];

        if (objLeaveReqHist["deptWork"] && objLeaveReqHist["deptWork"] != "") {
            objLeaveReqHist["deptWork"] = JSON.parse(objLeaveReqHist["deptWork"]).filter(obj => { return obj != "null" && obj != null && obj != "" })
            objLeaveReqHist["deptWork"] = objLeaveReqHist["deptWork"].map(item => item)
                .filter((value, index, self) => self.indexOf(value) === index)
        } else
            objLeaveReqHist["deptWork"];

        objLeaveReqHist['reqHist'] = arrReqHist;
        arrReqList.push(objLeaveReqHist);
    }
    return arrReqList;
}

/** To prepare the staff attendance report */
module.exports.PrepareReport = (pWorkingInfo, pInputParam, pResult, pCallback) => {
    pInputParam = { ...pInputParam, ...pWorkingInfo };
    user.GetStaffAttendance(pInputParam, function (err, rows) {
        if (err) {
            pCallback(err, []);
        }
        else {
            let stafflist = [];

            let lstUserID = rows[0].map(item => item.UserId)
                .filter((value, index, self) => self.indexOf(value) === index)

            let blnCurrentDayReport = false;
            if ((moment(new Date()).format('YYYY-MM-DD') == moment(pInputParam['startDate']).format('YYYY-MM-DD') && (moment(new Date()).format('YYYY-MM-DD') == moment(pInputParam['endDate']).format('YYYY-MM-DD'))))
                blnCurrentDayReport = true;



            let objLeaveTakenbyStaff = {};

            // lstUserID = [];
            for (let staffIndx = 0; staffIndx < lstUserID.length; staffIndx++) {

                // To set availed CL, Permision 
                let lstMasterLeave = rows[2];
                for (var j = 0; j < lstMasterLeave.length; j++) {
                    lstMasterLeave[j]['availed'] = (lstMasterLeave[j]['Alloted_Count'] > 0) ? 1 : 0;
                }

                let lstStaffML = lstMasterLeave;
                let arrStaffAtt = rows[0].filter(function (staff) {
                    return staff['UserId'] == lstUserID[staffIndx];
                })

                let arrStaffLeaveApplcn = rows[1].filter(function (staff) {
                    return staff['User_Code'] == lstUserID[staffIndx];
                })

                let lstStaffAtt = exports.AddMissedDate(pInputParam, arrStaffAtt);


                if (pInputParam['workingMode'] == 1) { // day based working mode
                    exports.DoCalculateLeave(pInputParam, lstStaffAtt, arrStaffLeaveApplcn, lstStaffML, blnCurrentDayReport);
                }
                else // Hours based working mode , COE => 2 and 3
                {
                    exports.CalculateHoursBasedLeave(pInputParam, lstStaffAtt, arrStaffLeaveApplcn, lstStaffML, blnCurrentDayReport);
                }


                let strWorkingType = "";
                /*  for COE -> applying NT General Leave 
                    for ERP -> applying T General Leave
                */
                if (lstStaffAtt[0]['working_mode'] == 2)
                    strWorkingType = "T"
                else
                    strWorkingType = pInputParam['staffType']

                let lstGL = rows[3].filter(function (objGL) {
                    return objGL['staffType'] == strWorkingType
                })

                exports.DoCalculateGL(lstStaffAtt, lstGL);

                __PrepareObject(pResult, lstStaffAtt, objLeaveTakenbyStaff, pInputParam);
            }
            let objCollege = {};
            if (rows[4].length > 0)
                objCollege = (rows[4][0] != null) ? rows[4][0] : {}
            pCallback(null, pResult, objLeaveTakenbyStaff, objCollege);
        }
    });
}

function __PrepareObject(pResult, pStaffAttResult, pLeaveTakenbyStaff, pInputParam) {
    var objStaff = {
        "userName": pStaffAttResult[0]['staffName'],
        "userCode": pStaffAttResult[0]['UserId'],
        "userType": pInputParam['staffType'], /* Teaching / Non - Teaching */
        "userPhotoUrl": pStaffAttResult[0]['encStaffUrl'],
        "userDepartment": pStaffAttResult[0]['deptAcr'],
        "userDesig": pStaffAttResult[0]['staffDesig']
    }

    if (pInputParam['reportType'].toUpperCase() != 'SINGLEDATE') {

        let arrLeave = {};
        let arrStaf = [];
        let UAL = 0;
        for (let ind = 0; ind < pStaffAttResult.length; ind++) {

            if (pStaffAttResult[ind]['FN'] == "A")
                arrLeave['UAL'] = (arrLeave['UAL']) ? arrLeave['UAL'] + 0.5 : 0.5
            if (pStaffAttResult[ind]['AN'] == "A")
                arrLeave['UAL'] = (arrLeave['UAL']) ? arrLeave['UAL'] + 0.5 : 0.5
            if (pStaffAttResult[ind]['FN'] == "L")
                arrLeave['L'] = (arrLeave['L']) ? arrLeave['L'] + 1 : 1;
            if (pStaffAttResult[ind]['FN'] == "PN" || pStaffAttResult[ind]['AN'] == "PN")
                arrLeave['PN'] = (arrLeave['PN']) ? arrLeave['PN'] + 1 : 1;

            if (pStaffAttResult[ind]['FN'] != "A" && pStaffAttResult[ind]['FN'] != "S" && pStaffAttResult[ind]['FN'] != "P" && pStaffAttResult[ind]['FN'] != "L" && pStaffAttResult[ind]['FN'] != "PN" && pStaffAttResult[ind]['FN'] != "-") {
                arrLeave[pStaffAttResult[ind]['FN']] = (arrLeave[pStaffAttResult[ind]['FN']]) ? arrLeave[pStaffAttResult[ind]['FN']] + 0.5 : 0.5
                pLeaveTakenbyStaff[pStaffAttResult[ind]['FN']] = 'Y';
            }
            if (pStaffAttResult[ind]['AN'] != "A" && pStaffAttResult[ind]['AN'] != "S" && pStaffAttResult[ind]['AN'] != "P" && pStaffAttResult[ind]['AN'] != "L" && pStaffAttResult[ind]['AN'] != "PN" && pStaffAttResult[ind]['AN'] != "-") {
                arrLeave[pStaffAttResult[ind]['AN']] = (arrLeave[pStaffAttResult[ind]['AN']]) ? arrLeave[pStaffAttResult[ind]['AN']] + 0.5 : 0.5
                pLeaveTakenbyStaff[pStaffAttResult[ind]['AN']] = 'Y';
            }

            arrStaf.push({
                "attendanceDate": pStaffAttResult[ind]['logDate'],
                "firstIn": (pStaffAttResult[ind]['bioInTime'] != 'NP') ? moment(pStaffAttResult[ind]['bioInTime'], "HH:mm:ss").format("hh:mm:ss A") : pStaffAttResult[ind]['bioInTime'],
                "lastOut": (pStaffAttResult[ind]['bioOutTime'] != 'NP') ? moment(pStaffAttResult[ind]['bioOutTime'], "HH:mm:ss").format("hh:mm:ss A") : pStaffAttResult[ind]['bioOutTime'],
                "totalWorkedHours": __TotalWorkedHours(pStaffAttResult[ind]['bioInTime'], pStaffAttResult[ind]['bioOutTime']),
                "status": { 'FN': pStaffAttResult[ind]['FN'], 'AN': pStaffAttResult[ind]['AN'] }
            })
        }
        objStaff['userLeaveCounts'] = arrLeave;
        objStaff['userAttendanceHistory'] = arrStaf;
    } else {
        objStaff["attendanceDate"] = pStaffAttResult[0]['logDate']
        objStaff["firstIn"] = (pStaffAttResult[0]['bioInTime'] != 'NP') ? moment(pStaffAttResult[0]['bioInTime'], "HH:mm:ss").format("hh:mm:ss A") : pStaffAttResult[0]['bioInTime']
        objStaff["lastOut"] = (pStaffAttResult[0]['bioOutTime'] != 'NP') ? moment(pStaffAttResult[0]['bioOutTime'], "HH:mm:ss").format("hh:mm:ss A") : pStaffAttResult[0]['bioOutTime']
        objStaff["totalWorkedHours"] = __TotalWorkedHours(pStaffAttResult[0]['bioInTime'], pStaffAttResult[0]['bioOutTime'])
        objStaff["status"] = { 'FN': pStaffAttResult[0]['FN'], 'AN': pStaffAttResult[0]['AN'] }
    }

    pResult.push(objStaff);
}

function __TotalWorkedHours(pInTime, pOutTime) {
    if (pInTime != 'NP' && pOutTime != 'NP') {
        // start time and end time
        var startTime = moment(pInTime, "HH:mm:ss");
        var endTime = moment(pOutTime, "HH:mm:ss");

        // calculate total duration
        var duration = moment.duration(endTime.diff(startTime));
        var seconds = parseInt(duration.asSeconds());

        return moment.utc(seconds * 1000).format('HH:mm:ss');
    } else
        return 'NA';
}

/*** To add missing date and find sunday and note it down on comments and leavetype */
module.exports.AddMissedDate = (pParam, pStaffLst) => {

    var currentDate = new Date(pParam.startDate);
    var endDate = new Date(pParam.endDate);

    var strStaffCode = pStaffLst[0]['UserId'];
    var strInTime = pStaffLst[0]['in_time'];
    var strOutTime = pStaffLst[0]['out_time'];
    var strWorkingHours = pStaffLst[0]['working_hours'];
    var strWorkingMode = pStaffLst[0]['working_mode'];
    var strStaffName = pStaffLst[0]['staffName'];
    var strDepartment = pStaffLst[0]['deptAcr'];
    var strPhotoUrl = pStaffLst[0]['encStaffUrl'];
    var strStaffDesig = pStaffLst[0]['staffDesig'];

    let blnSunday = false;

    let arrStaffLst = pStaffLst.filter(function (staff) {
        return staff['logDate'] != null;
    });

    while (currentDate <= endDate) {

        // find sunday and note down the sunday
        if (new Date(currentDate).getDay() == 0) {
            blnSunday = true;
        }
        // add missing dates
        // var arrDate = arrStaffLst.filter(function (staff) {
        //     return moment(staff['logDate']).format('YYYY-MM-DD') == moment(currentDate).format('YYYY-MM-DD');
        // });
        var arrDate = arrStaffLst.find((p) => {
            return moment(p['logDate']).format('YYYY-MM-DD') == moment(currentDate).format('YYYY-MM-DD');
        });

        if (arrDate == undefined) { // add missing date
            arrStaffLst.push({ "UserId": strStaffCode, "staffName": strStaffName, "logDate": new Date(currentDate), "bioInTime": null, "bioOutTime": null, "in_time": strInTime, "out_time": strOutTime, "lateStatus": 0, "lateSec": 0, "FN": ((blnSunday) ? "S" : 'NP'), "AN": ((blnSunday) ? "S" : 'NP'), "leaveType": ((blnSunday) ? "S" : ''), "comments": ((blnSunday) ? "S" : ''), "working_hours": strWorkingHours, "working_mode": strWorkingMode, "encStaffUrl": strPhotoUrl, "deptAcr": strDepartment, "staffDesig": strStaffDesig });
        } else { // notify if sunday   
            arrDate["FN"] = (blnSunday) ? "S" : arrDate["FN"];
            arrDate["AN"] = (blnSunday) ? "S" : arrDate["AN"];
            arrDate["leaveType"] = (blnSunday) ? "SUNDAY" : arrDate["leaveType"];
            arrDate["comments"] = (blnSunday) ? "SUNDAY" : arrDate["comments"];
        }
        blnSunday = false;
        currentDate = moment(currentDate).add(1, 'days');
    }
    __ChangeLogDate(arrStaffLst, pParam.workingMode);
    return arrStaffLst;
}

/* To calculating General Leave */
module.exports.DoCalculateGL = (pStaffLst, pGL) => {
    for (let i = 0; i < pGL.length; i++) {
        var tmp = pStaffLst.filter(function (staff) {
            return moment(staff['logDate']).format('YYYY-MM-DD') == moment(pGL[i]['leave_date']).format('YYYY-MM-DD');
        });
        if (tmp.length > 0) {
            __UpdateStatus(tmp[0], pGL[i]['leaveAcr'], pGL[i]['leaveAcr'], pGL[i]['Leave_Name'], pGL[i]['Leave_Name']);
        }
    }
}

/** To calculate leave based on leave application */
module.exports.DoCalculateLeave = (pParam, pStaffLst, pLeaveApplcn, pMasterLeave, pBlnCurrentDayReport) => {

    // if not avail any leave application, OD, Permission
    __GenerateLeaveApplcnNotAvail(pStaffLst, pMasterLeave, pBlnCurrentDayReport)

    // calculate saturday bio log outtime
    __DoCalculateSaturday(pParam, pStaffLst)

    let staffMidTime = __CalculateAfternoonTime(pStaffLst[0]['in_time'], pStaffLst[0]['out_time']); //12:35:00
    let staffANInTime = __CalculateANTime(pStaffLst[0]['in_time'], pStaffLst[0]['out_time']); // 13:20:00
    for (let j = 0; j < pLeaveApplcn.length; j++) {

        let noofdayApplied = __CalculateDaysApplied(pLeaveApplcn[j]['Avail_FromDate'], pLeaveApplcn[j]['Avail_ToDate']);
        let appliedHours = __CalculateTimeApplied(pLeaveApplcn[j]['Avail_FromTime'], pLeaveApplcn[j]['Avail_ToTime'])

        var lstLeave = pMasterLeave.filter(function (leave) {
            return leave['Leave_Name'] == pLeaveApplcn[j]['Leave_Name'];
        });
        if (lstLeave.length > 0) {
            let arrSeqDate = __GetSequenceDate(pParam, pLeaveApplcn[j]['Avail_FromDate'], pLeaveApplcn[j]['Avail_ToDate']);
            for (let i = 0; i < arrSeqDate.length; i++) {
                let arrStaff = pStaffLst.filter(function (staff) {
                    return moment(staff['logDate']).format('YYYY-MM-DD') == moment(arrSeqDate[i]).format('YYYY-MM-DD');
                })
                if (appliedHours == 0) { // Full day leave , availed and approved leave
                    if (arrStaff[0]['bioInTime'] == 'NP' && arrStaff[0]['bioOutTime'] == 'NP') {
                        if (pLeaveApplcn[j]['Final_Status'] == 1) {
                            __UpdateStatus(arrStaff[0], lstLeave[0]['leaveAcr'], lstLeave[0]['leaveAcr'], lstLeave[0]['Leave_Name'], '');
                            lstLeave[0]['availed'] = lstLeave[0]['availed'] - 1;
                        } else { // not availed but approved leave
                            if (lstLeave[0]['Alloted_Count'] > 0)
                                __UpdateStatus(arrStaff[0], "UAL", "UAL", 'Leave', 'leave - not allowed'); // applying not CL,OD,taken extra leave
                            else
                                __UpdateStatus(arrStaff[0], lstLeave[0]['leaveAcr'], lstLeave[0]['leaveAcr'], lstLeave[0]['Leave_Name'], ''); // applying OD
                        }
                    } else { // bio log is there
                        __BioLogExist(pLeaveApplcn[j], arrStaff[0], lstLeave[0]);
                    }
                } else if (appliedHours > 1) { // half day leave
                    if (pLeaveApplcn[j]['Final_Status'] == 1) { // if avail, half day leave  (lstLeave[0]['availed'] > 0 &&)
                        if (arrStaff[0]['bioInTime'] != 'NP' || arrStaff[0]['bioOutTime'] != 'NP') {  // bio log is there
                            let blnApplied = false;
                            // FN session applied leave
                            if (__IsForeNoonSession(arrStaff[0]['in_time'], pLeaveApplcn[j]['Avail_FromTime'], pLeaveApplcn[j]['Avail_ToTime'], staffMidTime) == true) {
                                if (arrStaff[0]['bioInTime'] <= __CalculateGracePeriodWithInTime(arrStaff[0]['in_time']) && arrStaff[0]['bioOutTime'] >= staffMidTime) // if they are in afternoon session present within time interval
                                    __UpdateStatus(arrStaff[0], "P", "", lstLeave[0]['Leave_Name'], '');
                                else {
                                    __UpdateStatus(arrStaff[0], lstLeave[0]['leaveAcr'], "", lstLeave[0]['Leave_Name'], 'not present in time interval');
                                    blnApplied = true;
                                }
                            }
                            // AN session applied leave
                            // if (!blnApplied) {
                            if (__IsForeNoonSession(staffANInTime, pLeaveApplcn[j]['Avail_FromTime'], pLeaveApplcn[j]['Avail_ToTime'], arrStaff[0]['out_time']) == true) {
                                if (arrStaff[0]['bioInTime'] <= staffANInTime && arrStaff[0]['bioOutTime'] >= arrStaff[0]['out_time']) // if they are in afternoon session present within time interval
                                    __UpdateStatus(arrStaff[0], "", "P", lstLeave[0]['Leave_Name'], lstLeave[0]['Leave_Name']);
                                else
                                    __UpdateStatus(arrStaff[0], "", lstLeave[0]['leaveAcr'], lstLeave[0]['Leave_Name'], 'not present in time interval');
                            }
                            // }
                        } else { // if bio log is not there
                            if (__IsForeNoonSession(arrStaff[0]['in_time'], pLeaveApplcn[j]['Avail_FromTime'], pLeaveApplcn[j]['Avail_ToTime'], staffMidTime) == true)
                                __UpdateStatus(arrStaff[0], lstLeave[0]['leaveAcr'], "", lstLeave[0]['Leave_Name'], '');
                            else
                                __UpdateStatus(arrStaff[0], "", lstLeave[0]['leaveAcr'], lstLeave[0]['Leave_Name'], '');
                            lstLeave[0]['availed'] = lstLeave[0]['availed'] - 1;
                        }
                    } //else // if not avail half day leave
                    // {
                    //     if (arrStaff[0]['bioInTime'] != 'NP' && arrStaff[0]['bioOutTime'] != 'NP') {  // bio log is there
                    //         if (IsForeNoonSession(arrStaff[0]['in_time'], pLeaveApplcn[j]['Avail_FromTime'], pLeaveApplcn[j]['Avail_ToTime'], staffMidTime) == true) {
                    //             if (arrStaff[0]['bioInTime'] <= __CalculateGracePeriodWithInTime(arrStaff[0]['in_time']) && arrStaff[0]['bioOutTime'] >= staffMidTime) // if they are in afternoon session present within time interval
                    //                 __UpdateStatus(arrStaff[0], "P", "", lstLeave[0]['Leave_Name'], '');
                    //             else
                    //                 __UpdateStatus(arrStaff[0], "A", "", lstLeave[0]['Leave_Name'], 'not present in time interval');// UAL
                    //         }
                    //         // AN session applied leave
                    //         if (IsForeNoonSession(arrStaff[0]['in_time'], pLeaveApplcn[j]['Avail_FromTime'], pLeaveApplcn[j]['Avail_ToTime'], staffMidTime) == false) {
                    //             if (arrStaff[0]['bioInTime'] <= staffMidTime && arrStaff[0]['bioOutTime'] >= staffMidTime) // if they are in afternoon session present within time interval
                    //                 __UpdateStatus(arrStaff[0], "", "P", lstLeave[0]['Leave_Name'], lstLeave[0]['Leave_Name']);
                    //             else
                    //                 __UpdateStatus(arrStaff[0], "", "A", lstLeave[0]['Leave_Name'], 'not present in time interval');
                    //         }
                    //     }
                    // }
                } else if (appliedHours <= 1) // permission
                {
                    if (pLeaveApplcn[j]['Final_Status'] == 1) { // if permission avail
                        if (arrStaff[0]['in_time'] >= pLeaveApplcn[j]['Avail_FromTime'] && pLeaveApplcn[j]['Avail_ToTime'] <= staffMidTime) {
                            __UpdateStatus(arrStaff[0], lstLeave[0]['leaveAcr'], "", lstLeave[0]['Leave_Name'], 'permission - ' + appliedHours);
                        } else {
                            __UpdateStatus(arrStaff[0], "", lstLeave[0]['leaveAcr'], lstLeave[0]['Leave_Name'], 'permission - ' + appliedHours);
                        }
                        lstLeave[0]['availed'] = lstLeave[0]['availed'] - 1;
                    } //else { // if not avail the permission
                    //     if (IsForeNoonSession(arrStaff[0]['in_time'], pLeaveApplcn[j]['Avail_FromTime'], pLeaveApplcn[j]['Avail_ToTime'], staffMidTime) == true) {
                    //         __UpdateStatus(arrStaff[0], "A", "", lstLeave[0]['Leave_Name'], 'permission - ' + appliedHours);
                    //     } else {
                    //         __UpdateStatus(arrStaff[0], "", "A", lstLeave[0]['Leave_Name'], 'permission - ' + appliedHours);
                    //     }
                    // }
                }
            }
        }
    }
}

/** To calculate hours based working mode based on leave application  */
module.exports.CalculateHoursBasedLeave = (pParam, pStaffLst, pLeaveApplcn, pMasterLeave, pBlnTodayReport) => {

    __NotAvailLeaveApplcnHoursBased(pStaffLst, pMasterLeave, pBlnTodayReport)

    for (var k = 0; k < pLeaveApplcn.length; k++) {

        let appliedHours = __CalculateTimeApplied(pLeaveApplcn[k]['Avail_FromTime'], pLeaveApplcn[k]['Avail_ToTime'])

        var lstLeave = pMasterLeave.filter(function (leave) {
            return leave['Leave_Name'] == pLeaveApplcn[k]['Leave_Name'];
        });
        if (lstLeave.length > 0) {
            let arrSeqDate = __GetSequenceDate(pParam, pLeaveApplcn[k]['Avail_FromDate'], pLeaveApplcn[k]['Avail_ToDate']);
            for (let i = 0; i < arrSeqDate.length; i++) {
                let arrStaff = pStaffLst.filter(function (staff) {
                    return moment(staff['logDate']).format('YYYY-MM-DD') == moment(arrSeqDate[i]).format('YYYY-MM-DD');
                })

                var strHours = moment(moment.duration(arrStaff[0]['working_hours']).asHours().toString() / 2, "HH:mm:ss");
                var strWorkingHours = moment(arrStaff[0]['working_hours'], "HH:mm:ss");

                if (appliedHours == 0) { // Full day leave // availed and approved leave
                    if (arrStaff[0]['bioInTime'] == 'NP' && arrStaff[0]['bioOutTime'] == 'NP') {
                        __FullDayLeave(pLeaveApplcn[k], arrStaff[0], lstLeave[0]);
                    } else if (arrStaff[0]['bioInTime'] != 'NP' && arrStaff[0]['bioOutTime'] != 'NP') { // leave applied but bio log is there
                        let hourDiff = __CalculateHourDiff(arrStaff[0]['bioInTime'], arrStaff[0]['bioOutTime']);
                        if (moment(hourDiff, "HH:mm:ss") >= strWorkingHours) { // full day present with total working hours
                            __UpdateStatus(arrStaff[0], "P", "P", '', '');
                        } else { //
                            let strMidTime = __CalculateHourBasedMidTime(pStaffLst[i]['bioInTime'], pStaffLst[i]['working_hours']);
                            let strEndTime = __CalculateHourBasedEndTime(pStaffLst[i]['bioInTime'], pStaffLst[i]['working_hours']);

                            // FN Session
                            if (moment(pStaffLst[i]['bioInTime'], "HH:mm:ss") <= moment("12:00:00", "HH:mm:ss") && pStaffLst[i]['bioOutTime'] >= strMidTime) {
                                __UpdateStatus(pStaffLst[i], "P", "", '', 'FN leave'); // morning present
                            } else {
                                __UpdateStatus(pStaffLst[i], lstLeave[0]['leaveAcr'], "", '', 'FN leave'); // Morning Absent
                            }
                            // AN Session
                            if (moment(pStaffLst[i]['bioInTime'], "HH:mm:ss") >= moment("12:00:00", "HH:mm:ss"))
                                strEndTime = strMidTime;

                            if (pStaffLst[i]['bioInTime'] <= strMidTime && pStaffLst[i]['bioOutTime'] >= strEndTime)
                                __UpdateStatus(pStaffLst[i], "", "P", '', 'AN Present'); // Afternoon present
                            else
                                __UpdateStatus(pStaffLst[i], "", lstLeave[0]['leaveAcr'], '', 'AN leave'); // Afternoon Absent
                        }
                    }
                } else if (appliedHours > 1) { // half day leave
                    if (pLeaveApplcn[k]['Final_Status'] == 1) { // if avail, half day leave 
                        if (arrStaff[0]['bioInTime'] != 'NP' || arrStaff[0]['bioOutTime'] != 'NP') {  // bio log is there
                            if (moment(arrStaff[0]['bioInTime'], "HH:mm:ss") <= moment("12:00:00", "HH:mm:ss"))  // if they are in forenoon session present 
                                __UpdateStatus(arrStaff[0], "", lstLeave[0]['leaveAcr'], lstLeave[0]['Leave_Name'], '');
                            else
                                __UpdateStatus(arrStaff[0], lstLeave[0]['leaveAcr'], "", lstLeave[0]['Leave_Name'], ''); //if they are in afternoon session present 
                            lstLeave[0]['availed'] = lstLeave[0]['availed'] - 0.5;
                        } else if (arrStaff[0]['bioInTime'] != 'NP' && arrStaff[0]['bioOutTime'] != 'NP') {
                            // Leave half day applied but bio log is there
                            let hourDiff = __CalculateHourDiff(arrStaff[0]['bioInTime'], arrStaff[0]['bioOutTime']);
                            if (moment(hourDiff, "HH:mm:ss") >= strWorkingHours) { // full day present with total working hours
                                __UpdateStatus(arrStaff[0], "P", "P", '', '');
                            } else {
                                let strMidTime = __CalculateHourBasedMidTime(pStaffLst[i]['bioInTime'], pStaffLst[i]['working_hours']);
                                let strEndTime = __CalculateHourBasedEndTime(pStaffLst[i]['bioInTime'], pStaffLst[i]['working_hours']);

                                // FN Session
                                let blnApplied = false;
                                if (moment(pStaffLst[i]['bioInTime'], "HH:mm:ss") <= moment("12:00:00", "HH:mm:ss") && pStaffLst[i]['bioOutTime'] >= strMidTime) {
                                    __UpdateStatus(pStaffLst[i], "P", "", '', 'FN leave'); // morning present
                                } else {
                                    __UpdateStatus(pStaffLst[i], lstLeave[0]['leaveAcr'], "", '', 'FN leave'); // Morning Absent
                                    blnApplied = true;
                                }
                                // AN Session
                                if (!blnApplied) {
                                    if (moment(pStaffLst[i]['bioInTime'], "HH:mm:ss") >= moment("12:00:00", "HH:mm:ss"))
                                        strEndTime = strMidTime;

                                    if (pStaffLst[i]['bioInTime'] <= strMidTime && pStaffLst[i]['bioOutTime'] >= strEndTime)
                                        __UpdateStatus(pStaffLst[i], "", "P", '', 'AN Present'); // Afternoon present
                                    else
                                        __UpdateStatus(pStaffLst[i], "", lstLeave[0]['leaveAcr'], '', 'AN leave'); // Afternoon Absent
                                }
                            }
                        }
                    }
                }
                else if (appliedHours <= 1) // permission
                {

                    let hourDiff = __CalculateHourDiff(arrStaff[0]['bioInTime'], arrStaff[0]['bioOutTime']);

                    if (new Date(arrStaff[0]['logDate']).getDay() == 6) {
                        let strSaturdayHour = moment(strWorkingHours).add(Number("-2"), 'hours').format("HH:mm:ss");
                        strWorkingHours = moment(strSaturdayHour, "HH:mm:ss");
                    } else {
                        let strSaturdayHour = moment(strWorkingHours).add(Number("-1"), 'hours').format("HH:mm:ss");
                        strWorkingHours = moment(strSaturdayHour, "HH:mm:ss");
                    }

                    if (pLeaveApplcn[k]['Final_Status'] == 1) { // if permission avail
                        if (moment(pLeaveApplcn[k]['Avail_FromTime'], "HH:mm:ss") <= moment("12:00:00", "HH:mm:ss"))  // if they are in forenoon session permission 
                        {
                            if (moment(hourDiff, "HH:mm:ss") >= strWorkingHours)  // full day present with permission and with total working hours
                                __UpdateStatus(arrStaff[0], lstLeave[0]['leaveAcr'], "P", lstLeave[0]['Leave_Name'], 'permission - ' + appliedHours);
                            else
                                __UpdateStatus(arrStaff[0], lstLeave[0]['leaveAcr'], "", lstLeave[0]['Leave_Name'], 'permission - ' + appliedHours);
                        }
                        else // afternoon permission
                        {
                            __UpdateStatus(arrStaff[0], "", lstLeave[0]['leaveAcr'], lstLeave[0]['Leave_Name'], 'permission - ' + appliedHours); //if they are in afternoon session permission
                        }
                        lstLeave[0]['availed'] = lstLeave[0]['availed'] - 1;
                    } else { // if not avail the permission
                        if (moment(pLeaveApplcn[k]['Avail_FromTime'], "HH:mm:ss") <= moment("12:00:00", "HH:mm:ss"))  // if they are in forenoon session permission 
                            __UpdateStatus(arrStaff[0], lstLeave[0]['leaveAcr'], "", lstLeave[0]['Leave_Name'], 'permission - ' + appliedHours);
                        else
                            __UpdateStatus(arrStaff[0], "", lstLeave[0]['leaveAcr'], lstLeave[0]['Leave_Name'], 'permission - ' + appliedHours); //if they are in afternoon session permission
                    }
                }
            }

        }
    }
}

function __BioLogExist(pLeaveApplcn, pStaff, pMasterLeave) {
    let strMidTime = __CalculateAfternoonTime(pStaff['in_time'], pStaff['out_time']); // 12:35:00
    let staffANInTime = __CalculateANTime(pStaff['in_time'], pStaff['out_time']);  // 13:20:00

    if (pStaff['bioInTime'] <= pStaff['in_time'] && pStaff['bioOutTime'] >= pStaff['out_time']) { // full day present 
        __UpdateStatus(pStaff, "P", "P", '', '');
    } else { // half day leave
        // FN session
        if (pStaff['bioInTime'] <= __CalculateGracePeriodWithInTime(pStaff['in_time']) && pStaff['bioOutTime'] >= strMidTime) // morning session present
            __UpdateStatus(pStaff, "P", "", pMasterLeave['Leave_Name'], pMasterLeave['Leave_Name']);
        else
            __UpdateStatus(pStaff, pMasterLeave['leaveAcr'], "", pMasterLeave['Leave_Name'], pMasterLeave['Leave_Name']);

        //Afternoon session  // if afternoon late, this statement is false    
        if (pStaff['bioInTime'] <= staffANInTime && pStaff['bioOutTime'] >= pStaff['out_time']) // after noon session present
            __UpdateStatus(pStaff, "", "P", pMasterLeave['Leave_Name'], pMasterLeave['Leave_Name']);
        else // afternoon late, but bio in punch is there 
            __UpdateStatus(pStaff, "", pMasterLeave['leaveAcr'], pMasterLeave['Leave_Name'], pMasterLeave['Leave_Name']);
    }
}

function __FullDayLeave(pLeaveApplcn, pStaff, pMasterLeave) {
    if (pLeaveApplcn['Final_Status'] == 1) {
        __UpdateStatus(pStaff, pMasterLeave['leaveAcr'], pMasterLeave['leaveAcr'], pMasterLeave['Leave_Name'], '');
        pMasterLeave['availed'] = pMasterLeave['availed'] - 1;
        // } else { // not availed but approved leave
        //     if (pMasterLeave['Alloted_Count'] > 0)
        //         __UpdateStatus(pStaff, "A", "A", 'Leave', 'leave - not allowed'); // applying not CL,OD,taken extra leave
        //     else
        //         __UpdateStatus(pStaff, pMasterLeave['leaveAcr'], pMasterLeave['leaveAcr'], pMasterLeave['Leave_Name'], pMasterLeave['Leave_Name']); // applying OD
    }
}

function __NotAvailLeaveApplcnHoursBased(pStaffLst, pMasterLeave, pBlnToday) {
    var strHours = moment(moment.duration(pStaffLst[0]['working_hours']).asHours().toString() / 2, "HH:mm:ss");

    for (var i = 0; i < pStaffLst.length; i++) {
        let strWorkingHours = moment(pStaffLst[0]['working_hours'], "HH:mm:ss");

        if ((pStaffLst[i]['bioInTime'] == null && pStaffLst[i]['bioOutTime'] == null) || (pStaffLst[i]['bioInTime'] == 'NP' && pStaffLst[i]['bioOutTime'] == 'NP')) { // Full day leave // availed and approved leave
            pStaffLst[i]['bioInTime'] = 'NP';
            pStaffLst[i]['bioOutTime'] = 'NP'
            __UpdateStatus(pStaffLst[i], (pStaffLst[i]['FN'] == '' || pStaffLst[i]['FN'] != 'S') ? "A" : pStaffLst[i]['FN'], (pStaffLst[i]['AN'] == '' || pStaffLst[i]['AN'] != 'S') ? "A" : pStaffLst[i]['AN'], (pStaffLst[i]['leaveType'] == '') ? 'Leave' : pStaffLst[i]['leaveType'], (pStaffLst[i]['comments'] == '') ? 'Leave' : pStaffLst[i]['comments']);
        } else if (pStaffLst[i]['bioInTime'] == pStaffLst[i]['bioOutTime']) { // both bio log punch are same
            if (moment(pStaffLst[i]['bioInTime'], "HH:mm:ss") <= moment("12:00:00", "HH:mm:ss")) { // if punch is morning session
                pStaffLst[i]['bioOutTime'] = 'NP';
                let strStatus = (pBlnToday) ? 'P' : 'A'; // if report as today date (system current date)
                __UpdateStatus(pStaffLst[i], 'P', strStatus, (pStaffLst[i]['leaveType'] == '') ? 'NP' : pStaffLst[i]['leaveType'], (pStaffLst[i]['comments'] == '') ? 'No Out Punch' : pStaffLst[i]['comments']);
            }
            else { // if punch is afternoon session
                pStaffLst[i]['bioInTime'] = 'NP';
                __UpdateStatus(pStaffLst[i], 'A', 'P', (pStaffLst[i]['leaveType'] == '') ? 'NP' : pStaffLst[i]['leaveType'], (pStaffLst[i]['comments'] == '') ? 'No Out Punch' : pStaffLst[i]['comments']);
            }
        }
        else { //availed bio log
            let hourDiff = __CalculateHourDiff(pStaffLst[i]['bioInTime'], pStaffLst[i]['bioOutTime']);

            if (new Date(pStaffLst[i]['logDate']).getDay() == 6) {
                let strSaturdayHour = moment(strWorkingHours).add(Number("-1"), 'hours').format("HH:mm:ss");
                strWorkingHours = moment(strSaturdayHour, "HH:mm:ss");
            }

            if (moment(hourDiff, "HH:mm:ss") >= strWorkingHours) { // full day present with total working hours
                __UpdateStatus(pStaffLst[i], "P", "P", '', '');
            } else {
                let strMidTime = __CalculateHourBasedMidTime(pStaffLst[i]['bioInTime'], moment(strWorkingHours).format("HH:mm:ss"));
                let strEndTime = __CalculateHourBasedEndTime(pStaffLst[i]['bioInTime'], moment(strWorkingHours).format("HH:mm:ss"));

                // FN Session
                if (moment(pStaffLst[i]['bioInTime'], "HH:mm:ss") <= moment("12:00:00", "HH:mm:ss"))
                    if (moment(pStaffLst[i]['bioOutTime'], "HH:mm:ss") >= moment(strMidTime, "HH:mm:ss"))
                        __UpdateStatus(pStaffLst[i], "P", "", '', 'FN leave'); // morning present
                    else
                        __UpdateStatus(pStaffLst[i], "A", "", '', 'FN leave'); // Morning Absent
                else
                    __UpdateStatus(pStaffLst[i], "A", "", '', 'FN leave'); // Morning Absent

                // AN Session
                if (moment(pStaffLst[i]['bioInTime'], "HH:mm:ss") >= moment("12:00:00", "HH:mm:ss")) {
                    strEndTime = strMidTime;
                    strMidTime = pStaffLst[i]['bioInTime'];
                }
                if (pStaffLst[i]['bioInTime'] <= strMidTime && pStaffLst[i]['bioOutTime'] >= strEndTime)
                    __UpdateStatus(pStaffLst[i], "", "P", '', 'AN Present'); // Afternoon present
                else
                    __UpdateStatus(pStaffLst[i], "", "A", '', 'AN leave'); // Afternoon Absent

            }



            // else if (__CalculateHourDiff(hourDiff, strWorkingHours) > 1 && hourDiff <= strHours) { // half day present with total working hours
            //     if (moment(pStaffLst[i]['bioInTime'], "HH:mm:ss") > moment("12:00:00", "HH:mm:ss")) { // check morning session/ afternoon session
            //         __UpdateStatus(pStaffLst[i], "A", "P", '', 'FN leave'); // afternoon present
            //     } else
            //         __UpdateStatus(pStaffLst[i], "P", "A", '', 'AN leave'); // forenoon present
            // } else if (__CalculateHourDiff(hourDiff, strWorkingHours) <= 1) { // permission
            //     __UpdateStatus(pStaffLst[i], "P", "P", 'Permission', 'Permission');
            // }
        }
    }
}

function __GenerateLeaveApplcnNotAvail(pStaffLst, pMasterLeave, pBlnToday) {
    let staffMidTime = __CalculateAfternoonTime(pStaffLst[0]['in_time'], pStaffLst[0]['out_time']); // 12:35:00
    let staffANInTime = __CalculateANTime(pStaffLst[0]['in_time'], pStaffLst[0]['out_time']);  // 13:20:00
    pBlnToday = false;
    for (let i = 0; i < pStaffLst.length; i++) {
        if ((moment(new Date()).format('YYYY-MM-DD') == moment(pStaffLst[i]['logDate']).format('YYYY-MM-DD')))
            pBlnToday = true;

        if (pStaffLst[i]['bioInTime'] == null && pStaffLst[i]['bioOutTime'] == null) { // Full day leave // availed and approved leave
            pStaffLst[i]['bioInTime'] = 'NP';
            pStaffLst[i]['bioOutTime'] = 'NP';

            let strFN = '', strAN = ''
            strFN = (pStaffLst[i]['FN'] == '' || pStaffLst[i]['FN'] != 'S') ? 'A' : pStaffLst[i]['FN']
            strAN = (pStaffLst[i]['AN'] == '' || pStaffLst[i]['AN'] != 'S') ? 'A' : pStaffLst[i]['AN']
            if (pBlnToday) {
                var curTime = __GetCurrentTime(); //moment(Date.now).format('HH:mm:ss')

                if (curTime <= pStaffLst[i]['in_time']) { // CUR_SYS time is now before staff IN_TIME 
                    strFN = (pStaffLst[i]['FN'] == '' || pStaffLst[i]['FN'] != 'S') ? '-' : pStaffLst[i]['FN']
                    strAN = (pStaffLst[i]['AN'] == '' || pStaffLst[i]['AN'] != 'S') ? '-' : pStaffLst[i]['AN']
                } else if (curTime <= pStaffLst[i]['out_time']) { // CUR_SYS time is now before staff MID_TIME 
                    strAN = (pStaffLst[i]['AN'] == '' || pStaffLst[i]['AN'] != 'S') ? '-' : pStaffLst[i]['AN']
                }
            }
            __UpdateStatus(pStaffLst[i], strFN, strAN, (pStaffLst[i]['leaveType'] == '') ? 'Leave' : pStaffLst[i]['leaveType'], (pStaffLst[i]['comments'] == '') ? 'Leave' : pStaffLst[i]['comments']);
        } else if (pStaffLst[i]['bioInTime'] == pStaffLst[i]['bioOutTime']) { // both the biometry log are same
            // FN session
            if (pStaffLst[i]['bioInTime'] <= staffMidTime) { // if punch is morning session
                pStaffLst[i]['bioOutTime'] = 'NP';

                let strAN = ((pStaffLst[i]['AN'] != 'S') ? 'A' : pStaffLst[i]['AN'])

                var curTime = __GetCurrentTime();
                if (pBlnToday && pStaffLst[i]['AN'] != 'S' && curTime >= pStaffLst[i]['out_time'])  // if report as today date (system current date)
                    strAN = 'P'
                if (pBlnToday && pStaffLst[i]['AN'] != 'S' && curTime < pStaffLst[i]['out_time'])
                    strAN = '-'

                __UpdateStatus(pStaffLst[i], '', strAN, (pStaffLst[i]['leaveType'] == '') ? 'NP' : pStaffLst[i]['leaveType'], (pStaffLst[i]['comments'] == '') ? 'No Out Punch' : pStaffLst[i]['comments']);
            } else if (pStaffLst[i]['bioInTime'] > staffMidTime) {
                pStaffLst[i]['bioInTime'] = 'NP';
                __UpdateStatus(pStaffLst[i], '', ((pStaffLst[i]['AN'] != 'S') ? 'A' : pStaffLst[i]['AN']), (pStaffLst[i]['leaveType'] == '') ? 'NP' : pStaffLst[i]['leaveType'], (pStaffLst[i]['comments'] == '') ? 'No Out Punch' : pStaffLst[i]['comments']);
            }
        }
        else { //availed bio log
            if (pStaffLst[i]['bioInTime'] != null && pStaffLst[i]['bioOutTime'] != null) {  // bio log is there
                if (pStaffLst[i]['bioInTime'] != pStaffLst[i]['bioOutTime']) {

                    // Check FN session
                    if (pStaffLst[i]['bioOutTime'] <= staffMidTime) // morning session leave according to bio log
                        __UpdateStatus(pStaffLst[i], "A", "", 'FN Leave', 'Morning session leave');
                    // else
                    //     __UpdateStatus(pStaffLst[i], "A", "", 'FN Leave', 'AN late');

                    // check AN session 
                    if (pStaffLst[i]['bioInTime'] <= staffANInTime && pStaffLst[i]['bioOutTime'] >= pStaffLst[i]['out_time']) // morning session leave according to bio log
                        __UpdateStatus(pStaffLst[i], "", ((pStaffLst[i]['AN'] != 'S') ? 'P' : pStaffLst[i]['AN']), 'AN Leave', 'AN leave');
                    else
                        __UpdateStatus(pStaffLst[i], "", ((pStaffLst[i]['AN'] != 'S') ? 'A' : pStaffLst[i]['AN']), 'AN Leave', 'FN late');


                }
            }
        }
    }
}

function __GetCurrentTime() {
    let date = new Date(); // Date.now();
    var hours = date.getHours()
    var minutes = date.getMinutes()
    var seconds = date.getSeconds();
    if (hours < 10)
        hours = "0" + hours;

    if (minutes < 10)
        minutes = "0" + minutes;

    if (seconds < 10)
        seconds = "0" + seconds;
    return hours + ":" + minutes + ":" + seconds
}

function __DoCalculateSaturday(pInputParam, pStaffList) {
    if (pInputParam['workingMode'] == 1) {
        let strSaturdayOutTime = ""
        if (pInputParam['staffType'] == 'T') {

            // start time and end time
            var outTime = __ConvertToSeconds(pStaffList[0]['out_time']);
            var graceTime = __ConvertToSeconds("01:30:00");

            // calculate total duration
            var durat = moment.duration(Number(outTime - graceTime), "seconds");

            // duration in seconds
            strSaturdayOutTime = moment.utc(durat.as('milliseconds')).format('HH:mm:ss');
        } else if (pInputParam['staffType'] == 'NT') {
            strSaturdayOutTime = "17:30:00"; // 05:30:00 at saturday
        }

        for (let staffIndx = 0; staffIndx < pStaffList.length; staffIndx++) {
            // find saturday and note down the saturday

            if (new Date(pStaffList[staffIndx]['logDate']).getDay() == 6) {
                if (pStaffList[staffIndx]['bioOutTime'] != 'NP' && pStaffList[staffIndx]['bioOutTime'] >= strSaturdayOutTime)
                    __UpdateStatus(pStaffList[staffIndx], "", "P", "", "");
                // else
                //     __UpdateStatus(pStaffList[staffIndx], "", "A", "", "");
            }
        }
    }
}

function __UpdateStatus(pObject, pFN, pAN, pLeaveType, pComments) {
    pObject['FN'] = (pFN != '') ? pFN : pObject['FN'];
    pObject['AN'] = (pAN != '') ? pAN : pObject['AN'];
    pObject['leaveType'] = (pLeaveType != '') ? pLeaveType : pObject['leaveType'];
    pObject['comments'] = (pComments != '') ? pComments : pObject['comments'];
}

function __ChangeLogDate(pStaffLst, pWorkingMode) {
    for (var k = 0; k < pStaffLst.length; k++) {

        pStaffLst[k]['logDate'] = moment(pStaffLst[k]['logDate']).format('YYYY-MM-DD');

        if (pWorkingMode == 2) {
            // if (pStaffLst[k]['lateStatus'] > 0)
            //     __UpdateStatus(pStaffLst[k], "", "", (pStaffLst[k]['leaveType'] != '') ? pStaffLst[k]['leaveType'] : "Delay", (pStaffLst[k]['comments'] != '') ? pStaffLst[k]['comments'] : "Delay");

            if (__CalculateMinutesDiff(pStaffLst[k]['bioInTime'], pStaffLst[k]['bioOutTime']) < moment.duration(pStaffLst[k]['working_hours'], "minutes").asMinutes()) {
                __UpdateStatus(pStaffLst[k], "P", (pStaffLst[k]["AN"] != 'NOP') ? "A" : pStaffLst[k]["AN"], "", "");
            }
        }
    }

    // To Sort by Date 
    pStaffLst.sort(function (a, b) {
        return new Date(a.logDate) - new Date(b.logDate)
    })
}

function __GetSequenceDate(pParam, pFromDate, pToDate) {
    var currentDate = new Date(pFromDate);
    var endDate = new Date(pToDate);
    var arrSeqDate = [];
    while (currentDate <= endDate) {
        if (moment(currentDate).diff(pParam['startDate']) >= 0 && moment(currentDate).diff(pParam['endDate']) <= 0)
            arrSeqDate.push(currentDate);
        currentDate = moment(currentDate).add(1, 'days');
    }
    return arrSeqDate;
}

function __CalculateDaysApplied(pStartDate, pEndDate) {
    var strStartDate = moment(pStartDate);
    var strEndDate = moment(pEndDate);
    var d = strEndDate.diff(strStartDate, 'days');
    return d + 1;
}

function __CalculateTimeApplied(pInTime, pOutTime) {
    // start time and end time
    var startTime = moment(pInTime, "HH:mm:ss");
    var endTime = moment(pOutTime, "HH:mm:ss");

    // calculate total duration
    var duration = moment.duration(endTime.diff(startTime));

    // duration in hours
    var hours = parseInt(duration.asHours());
    return hours;
}

function __CalculateHourDiff(pInTime, pOutTime) {
    // start time and end time
    var startTime = moment(pInTime, "HH:mm:ss");
    var endTime = moment(pOutTime, "HH:mm:ss");

    // calculate total duration
    var duration = moment.duration(endTime.diff(startTime));

    // duration in hours
    var hours = parseInt(duration.asHours());
    return hours;
}

function __CalculateMinutesDiff(pInTime, pOutTime) {
    // start time and end time
    var startTime = moment(pInTime, "HH:mm");
    var endTime = moment(pOutTime, "HH:mm");

    // calculate total duration
    var duration = moment.duration(endTime.diff(startTime));

    // duration in hours
    var minutes = parseInt(duration.asMinutes());
    return minutes;
}

function __CalculateDayDiff(pFromDate, pToDate, pInputParam) {
    // start date and end date
    var start = moment(pFromDate);
    var end = moment(pToDate);
    if (start < moment(pInputParam['startDate']))
        start = moment(pInputParam['startDate']);
    if (end > moment(pInputParam['endDate']))
        end = moment(pInputParam['endDate']);

    var duration = moment.duration(end.diff(start));
    return duration.asDays() + 1;
}

function __CalculateAfternoonTime(pInTime, pOutTime) {
    // start time and end time
    var startTime = moment(pInTime, "HH:mm:ss");
    var endTime = moment(pOutTime, "HH:mm:ss");

    // calculate total duration
    var duration = moment.duration(endTime.diff(startTime));

    // duration in hours
    var sec = parseInt(duration.asSeconds());

    let staffMiddleTime = moment(startTime).add(sec / 2, 'seconds').format("HH:mm:ss");
    // return staffMiddleTime;
    return "12:35:00"
}

function __CalculateANTime(pInTime, pOutTime) {
    // start time and end time
    var startTime = moment(pInTime, "HH:mm:ss");
    var endTime = moment(pOutTime, "HH:mm:ss");

    // calculate total duration
    var duration = moment.duration(endTime.diff(startTime));

    // duration in hours
    var sec = parseInt(duration.asSeconds());

    let staffMiddleTime = moment(startTime).add(sec / 2, 'seconds').format("HH:mm:ss");
    // return staffMiddleTime;
    return "13:20:00";
}

function __CalculateMidTime(pWorkingHours, pBioInTime) {
    // start time and end time
    var startTime = moment(pBioInTime, "HH:mm:ss");

    let staffMiddleTime = moment(pBioInTime).add(pWorkingHours / 2, 'hours').format("HH:mm:ss");
    return staffMiddleTime;
}

function __IsForeNoonSession(pStaffInTime, pStartTime, pEndTime, pStaffMiddleTime) {
    if (pStartTime <= pStaffInTime && pEndTime >= pStaffMiddleTime)
        return true;
    else
        return false;
}

// function __IsForeNoonSession(pStaffInTime, pStartTime, pEndTime, pStaffMiddleTime) {
//     if (pStaffInTime >= pStartTime && pEndTime <= pStaffMiddleTime)
//         return true;
//     else
//         return false;
// }

function IsForeNoonSession(pStaffInTime, pStartTime, pEndTime, pStaffMiddleTime) {
    if (pStaffInTime >= pStartTime && pStaffMiddleTime <= pEndTime)
        return true;
    else
        return false;
}

function __ConvertToSeconds(pTime) {
    return moment.duration(pTime).asSeconds();
}

function __CalculateGracePeriodWithInTime(pInTime) {
    // start time and end time
    var outTime = __ConvertToSeconds(pInTime);
    var graceTime = __ConvertToSeconds("00:15:00");

    // calculate total duration
    var durat = moment.duration(Number(outTime + graceTime), "seconds");

    // duration in seconds
    var strInTime = moment.utc(durat.as('milliseconds')).format('HH:mm:ss');

    return strInTime;

    // let mInTime = moment(pInTime, "HH:mm:ss");
    // let stafGraceTime = moment(mInTime).add(15, 'minutes').format("HH:mm:ss");
    // return moment.duration(stafGraceTime).asSeconds();
}

function __CalculateHourBasedMidTime(pInTime, pWorkingHours) {
    var strHours = moment(moment.duration(pWorkingHours).asSeconds() / 2, "HH:mm:ss");
    // start time and end time
    var inTime = moment.duration(pInTime).asSeconds();

    // calculate total duration
    var durat = moment.duration(Number(inTime + strHours._i), "seconds");

    // duration in seconds
    var strMidTime = moment.utc(durat.as('milliseconds')).format('HH:mm:ss');

    return strMidTime;
}


function __CalculateHourBasedEndTime(pInTime, pWorkingHours) {

    // start time and end time
    var strHours = moment.duration(pWorkingHours).asSeconds();
    var inTime = moment.duration(pInTime).asSeconds();
    // calculate total duration
    var durat = moment.duration(Number(inTime + strHours), "seconds");

    // duration in seconds
    var strMidTime = moment.utc(durat.as('milliseconds')).format('HH:mm:ss');

    return strMidTime;

}


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////Academic Service//////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

module.exports.PrepareAssignElectivePaper = (pRows) => {
    let lstSubjects = pRows.map(function (obj) { return obj; });
    lstSubjects = lstSubjects.filter((value, index, self) => self.map(x => x.subCode).indexOf(value.subCode) == index)

    // To get total students
    let arrTotalStudents = pRows.map(function (obj) { return obj; });
    arrTotalStudents = arrTotalStudents.filter((value, index, self) => self.map(x => x.registerNo).indexOf(value.registerNo) == index)

    let lstStudents = []
    for (let j = 0; j < arrTotalStudents.length; j++) {
        let arrStuSubjects = pRows.filter(function (stu) {
            return stu.registerNo == arrTotalStudents[j]['registerNo']
        })

        let arrStuSubjectAssigned = arrStuSubjects.filter(function (stu) {
            return stu.assigned != 0
        }).map(obj => { return { "subCode": obj.subCode, "subName": obj.subName } })

        lstStudents.push({
            "registerNo": arrTotalStudents[j]['registerNo'],
            "studentName": arrTotalStudents[j]['studentName'],
            "subjectList": arrStuSubjectAssigned
        })
    }


    let arrSubjects = [];
    for (let i = 0; i < lstSubjects.length; i++) {

        let lstAssignedStud = pRows.filter(function (obj) {
            return obj.subCode == lstSubjects[i]['subCode'] && obj.assigned != 0
        })

        let arrTotalStudList = pRows.filter(function (obj) {
            return obj.subCode == lstSubjects[i]['subCode']
        }).map(stu => {
            let assignedSub = lstStudents.filter(sub => { return sub['registerNo'] == stu['registerNo'] })
                .map(item => { return item['subjectList'] })[0];
            return {
                "registerNo": stu.registerNo,
                "studentName": stu.studentName,
                "assigned": parseInt((stu.assigned != 0 || stu.assigned != "0") ? 1 : stu.assigned),
                "assignedSubCount": assignedSub.length,
                "assignedSub": assignedSub
            }
        })

        arrSubjects.push({
            "subId": lstSubjects[i]['subjectId'],
            "subName": lstSubjects[i]['subName'],
            "subCode": lstSubjects[i]['subCode'],
            "subType": lstSubjects[i]['subType'],
            "studentsAssigned": lstAssignedStud.length,
            "staffName": lstSubjects[i]['staffName'],
            "staffDept": lstSubjects[i]['staffDept'],
            "staffDesignation": lstSubjects[i]['staffDesignation'],
            "totalStudents": arrTotalStudents.length,
            "studentList": arrTotalStudList
        })
    }
    return arrSubjects;
}

/*module.exports.PrepareClassAndSubjectWiseIATMark = (pResultRow, pClassWise) => {
    let objResult = {}
    let lstStudents = [];
    let pRows = pResultRow[0];
    let strRegulation = (pResultRow[0].length > 0) ? pResultRow[0][0]['regulation'] : (pResultRow[1].length > 0) ? pResultRow[1][0]['regulation'] : "";


    if (pClassWise) { // ClassWise IAT report
        if (pRows.length > 0) {
            objResult = {
                "collegeName": pRows[0]['collegeName'],
                "collegeCode": pRows[0]['collegeCode'],
                "course": pRows[0]['course'],
                "courseName": pRows[0]['courseName'],
                "deptCode": pRows[0]['deptCode'],
                "Semester": pRows[0]['semester'].toString().padStart(2, '0'),
                "Regulation": pRows[0]['regulation']
            }
        }
        objResult["subjectList"] = (pClassWise) ? pResultRow[2] : []

        let arrStudents = pRows.map(function (obj) { return { "registerNo": obj.registerNo, "stuName": obj.stuName, "semester": obj.semester, "regulation": obj.regulation }; });
        arrStudents = arrStudents.filter((value, index, self) => self.map(x => x.registerNo).indexOf(value.registerNo) == index)

        let arrSubject = pResultRow[2]; // subject list from class wise query result
        for (let stuIndx = 0; stuIndx < arrStudents.length; stuIndx++) {
            let stu = {}

            for (let i = 0; i < arrSubject.length; i++) {
                let mInternal = 0;
                let arrMark = [];

                if (arrSubject[i]['subType'] == "P") {
                    arrMark = pResultRow[1].filter(function (obj) {
                        return obj.subCode == arrSubject[i]['subCode'] && obj.registerNo == arrStudents[stuIndx]['registerNo']
                    })

                    mInternal = __CalculateLabInternal(arrMark, strRegulation, null);
                } else if (arrSubject[i]['subType'] == "C") { // Theory come practical paper 
                    // Theory Test - 30 , Labexper - 10, labmodel - 10   => 50 Internal and 50 External
                    // calculate theory mark (30)
                    arrMark = pRows.filter(function (obj) {
                        return obj.subCode == arrSubject[i]['subCode'] && obj.registerNo == arrStudents[stuIndx]['registerNo']
                    })

                    // calculate lab mark (20)
                    let arrLabMark = pResultRow[1].filter(function (obj) {
                        return obj.subCode == arrSubject[i]['subCode'] && obj.registerNo == arrStudents[stuIndx]['registerNo']
                    })
                    mInternal = __CalculateTheoryCPracticalInternal(arrMark, arrLabMark, strRegulation, null)
                } else if (arrSubject[i]['subType'] == "J") { // Project Paper
                    arrMark = pRows.filter(function (obj) {
                        return obj.subCode == arrSubject[i]['subCode'] && obj.registerNo == arrStudents[stuIndx]['registerNo']
                    })
                    mInternal = __CalculateProjectInternal(arrMark, strRegulation, null)
                }
                else {
                    arrMark = pRows.filter(function (obj) {
                        return obj.subCode == arrSubject[i]['subCode'] && obj.registerNo == arrStudents[stuIndx]['registerNo']
                    })

                    // for MBA there is no mark for particular subjects and particular students
                    if (arrMark.length == 0)
                        mInternal = "-"
                    else
                        mInternal = __CalculateTheoryInternal(arrMark, strRegulation, null);
                }

                let strSubKey = arrSubject[i]['subCode'] + '-' + arrSubject[i]['subAcrn']
                stu[strSubKey] = (mInternal == "-") ? mInternal : (Math.round((isNaN(mInternal) ? 0 : mInternal)));

            }
            lstStudents.push({
                "RegisterNumber": arrStudents[stuIndx]['registerNo'],
                "Name": arrStudents[stuIndx]['stuName'],
                ...stu
            })
        }
    }
    else { // Class with subject wise report

        let subType = (pRows.length > 0) ? pRows[0]['subType'] : (pResultRow[1].length > 0) ? pResultRow[1][0]['subType'] : "";

        if (subType == "P")
            pRows = (pRows.length == 0) ? pResultRow[1] : pRows; // assign if Practical subject


        let arrStudents = pRows.map(function (obj) { return { "registerNo": obj.registerNo, "stuName": obj.stuName, "semester": obj.semester, "regulation": obj.regulation }; });
        arrStudents = arrStudents.filter((value, index, self) => self.map(x => x.registerNo).indexOf(value.registerNo) == index)

        for (let stuIndx = 0; stuIndx < arrStudents.length; stuIndx++) {

            let arrMark = pRows.filter(function (obj) {
                return obj.registerNo == arrStudents[stuIndx]['registerNo']
            })
            let objStu = {
                "RegisterNumber": arrMark[0]['registerNo'],
                "Name": arrMark[0]['stuName']
            }
            let totalMark = 0;
            if (subType == "P") { // practical subject
                objStu['Internal'] = __CalculateLabInternal(arrMark, strRegulation, objStu); // Internal Mark calculation
            } else if (subType == "C") {
                // Theory Test - 30 , Labexper - 10, labmodel - 10   => 50 Internal and 50 External
                // calculate theory mark (30)

                let arrLabMark = pResultRow[1].filter(function (obj) {
                    return obj.registerNo == arrStudents[stuIndx]['registerNo']
                })

                objStu['Internal'] = __CalculateTheoryCPracticalInternal(arrMark, arrLabMark, strRegulation, objStu);

            } else if (subType == "J") { // Project Paper

                objStu['Internal'] = __CalculateProjectInternal(arrMark, strRegulation, objStu)
            }
            else { // theory subject
                objStu['Internal'] = __CalculateTheoryInternal(arrMark, strRegulation, objStu);
            }
            lstStudents.push(objStu);
        }
    }
    objResult['studentList'] = lstStudents;
    return objResult;
}*/

function __CalculateLabInternal(arrMark, pRegulation, pObjStu) {
    /**************************************************************
     * Regulation => R2013 & R2017
     *      Internal => 20      (calculate 20 internal mark)
     *      External => 80
     * Regulation => R2019
     *      Internal => 50      (calculate 50 internal mark)
     *      External => 50
     **************************************************************/

    if (pRegulation == "R2013" || pRegulation == "R2017") {
        /**************************
         * LabExperiments   - 75
         * LabModel         - 25
         **************************/
        let totalMark = 0;
        for (let mrkIndx = 0; mrkIndx < arrMark.length; mrkIndx++) {
            if (pObjStu != null) pObjStu[arrMark[mrkIndx]['testAcr']] = arrMark[mrkIndx]['mark'];
            let strMark = 0;
            if (arrMark[mrkIndx]['testAcr'].toLowerCase().indexOf('model') >= 0)
                strMark = (arrMark[mrkIndx]['mark'] / 100) * 25;    // LabModel into 25
            else
                strMark = (arrMark[mrkIndx]['mark'] / 100) * 75;   // labexperimets into 75
            totalMark = totalMark + strMark;
        }
        return Math.round(isNaN((totalMark / 100) * 20) ? 0 : (totalMark / 100) * 20);
    } else if (pRegulation == "R2019" || pRegulation == "R2020") {
        /**************************
             * LabExperiments   - 30
             * LabModel         - 20
             **************************/
        let totalMark = 0;
        for (let mrkIndx = 0; mrkIndx < arrMark.length; mrkIndx++) {
            if (pObjStu != null) pObjStu[arrMark[mrkIndx]['testAcr']] = arrMark[mrkIndx]['mark'];
            let strMark = 0;
            if (arrMark[mrkIndx]['testAcr'].toLowerCase().indexOf('model') >= 0)
                strMark = (arrMark[mrkIndx]['mark'] / 100) * 20;    // LabModel into 20
            else
                strMark = (arrMark[mrkIndx]['mark'] / 100) * 30;   // labexperimets into 30
            totalMark = totalMark + strMark;
        }
        return Math.round(isNaN(totalMark) ? 0 : totalMark);
    }
}

function __CalculateTheoryInternal(arrMark, pRegulation, pStudent) {
    /**************************************************************
     * Regulation => R2013 & R2017
     *      Internal => 20      (calculate 20 internal mark)
     *      External => 80
     * Regulation => R2019
     *      Internal => 40      (calculate 40 internal mark)
     *      External => 60
     **************************************************************/
    if (pRegulation == "R2013" || pRegulation == "R2017") {
        let totalMark = 0;
        for (let mrkIndx = 0; mrkIndx < arrMark.length; mrkIndx++) {
            if (pStudent != null) pStudent[arrMark[mrkIndx]['testAcr']] = arrMark[mrkIndx]['mark'];
            totalMark = totalMark + arrMark[mrkIndx]['mark'];
        }
        // pStudent['Average'] = Math.round(totalMark / arrMark.length); // Average of mark
        let strInternal = Math.round((totalMark / (arrMark.length * 100)) * 20); // Internal Mark calculation
        // if (pStudent != null) pStudent['Internal'] = strInternal
        return strInternal

    } else if (pRegulation == "R2019" || pRegulation == "R2020") {
        /*********************************** 
         * CAT (100)    => converted to 30
         * FAT (25)     => converted to 10
         * Total Internal => 40
         ***********************************/

        let totalMark = 0;
        // CAT test (Common Assessment Test)
        let arrCAT = arrMark.filter(function (objMark) {
            return objMark['testAcr'].toUpperCase().indexOf("CAT") >= 0
        })
        for (let m = 0; m < arrCAT.length; m++) {
            if (pStudent != null) pStudent[arrCAT[m]['testAcr']] = arrCAT[m]['mark'];
            totalMark = totalMark + arrCAT[m]['mark'];
        }
        let strCATMark = Number(((totalMark / (100 * arrCAT.length)) * 30).toFixed(1));

        // pStudent['CAT-Average'] = Math.round(isNaN(totalMark / arrCAT.length) ? 0 : (totalMark / arrCAT.length)); // Average of mark
        totalMark = 0;
        let strFATMark = 0;
        if (arrMark[0]["subType"] != "C") {
            // FAT test (Formative Assessment Test)
            let arrFAT = arrMark.filter(function (objMark) {
                return objMark['testAcr'].toUpperCase().indexOf("FAT") >= 0
            })
            totalMark = 0;
            for (let m = 0; m < arrFAT.length; m++) {
                if (pStudent != null) pStudent[arrFAT[m]['testAcr']] = arrFAT[m]['mark'];
                totalMark = totalMark + arrFAT[m]['mark'];
            }
            strFATMark = Number(((totalMark / (25 * arrFAT.length)) * 10).toFixed(1));
        }

        // pStudent['FAT-Average'] = Math.round(isNaN(totalMark / arrFAT.length) ? 0 : (totalMark / arrFAT.length)); // Average of mark
        let strInternal = Math.round((isNaN(strCATMark) ? 0 : strCATMark) + (isNaN(strFATMark) ? 0 : strFATMark)); // Internal Mark calculation
        // if (pStudent != null)
        //     pStudent['Internal'] = strInternal

        return strInternal
    }
}


function __CalculateTheoryCPracticalInternal(arrTheoryMark, arrPracticalMark, pRegulation, pObjStu) {
    if (pRegulation == "R2013" || pRegulation == "R2017") {
        /**********************************************************/
        /* Theory  (60)
                - best of two IAT  Sum(Two IAT)/200 * 60 
            Practical (40)
                - LabExpr  - 20
                - LabModel - 20
            
            Internal(20) = (Theory(60) + Practical(40)) /100 * 20
          */
        /**********************************************************/
        // To calculate theory internal
        let strTotal = __BestOfTwoIAT(arrTheoryMark, pObjStu);
        let strTheoryInternal = (strTotal / 200) * 60;

        // To calculate lab internal
        let strLabInternal = 0;
        for (let mrkIndx = 0; mrkIndx < arrPracticalMark.length; mrkIndx++) {
            if (pObjStu != null) pObjStu[arrPracticalMark[mrkIndx]['testAcr']] = arrPracticalMark[mrkIndx]['mark'];
            let strMark = 0;
            if (arrPracticalMark[mrkIndx]['testAcr'].toLowerCase().indexOf('model') >= 0)
                strMark = (arrPracticalMark[mrkIndx]['mark'] / 100) * 20;    // LabModel into 20
            else
                strMark = (arrPracticalMark[mrkIndx]['mark'] / 100) * 20;   // labexperimets into 20
            strLabInternal = strLabInternal + strMark;
        }
        let strInternal = (strTheoryInternal + strLabInternal) / 100 * 20;  // converted to 20
        return Math.round(strInternal)

    }
    else if (pRegulation == "R2019" || pRegulation == "R2020") {
        // Theory Test - 30 , Labexper - 10, labmodel - 10   => 50 Internal and 50 External
        // calculate theory mark (30)
        let strInternal = __CalculateTheoryInternal(arrTheoryMark, pRegulation, pObjStu);

        // calculate lab mark (20)
        let totalMark = 0;
        for (let mrkIndx = 0; mrkIndx < arrPracticalMark.length; mrkIndx++) {
            if (pObjStu != null) pObjStu[arrPracticalMark[mrkIndx]['testAcr']] = arrPracticalMark[mrkIndx]['mark'];
            let strMark = 0;
            if (arrPracticalMark[mrkIndx]['testAcr'].toLowerCase().indexOf('model') >= 0)
                strMark = (arrPracticalMark[mrkIndx]['mark'] / 100) * 10;    // LabModel into 10
            else
                strMark = (arrPracticalMark[mrkIndx]['mark'] / 100) * 10;   // labexperimets into 10
            totalMark = totalMark + strMark;
        }
        strInternal = strInternal + totalMark
        return Math.round(strInternal)
    }
}


function __CalculateProjectInternal(arrMark, pRegulation, pObjStu) {
    /**************************************************************
     * Regulation => R2013 & R2017
     *      Internal => 20      (calculate 20 internal mark)
     *          REV I - convert to 5
     *          REV II - convert to 7.5
     *          REV III - convert to 7.5
     *      External => 80
     * Regulation => R2019
     *      Internal => 50      (calculate 50 internal mark).
     * 
     *      External => 50
     **************************************************************/
    if (pRegulation == "R2013" || pRegulation == "R2017") {
        let totalMark = 0;
        for (let mrkIndx = 0; mrkIndx < arrMark.length; mrkIndx++) {
            if (pObjStu != null) pObjStu[arrMark[mrkIndx]['testAcr']] = arrMark[mrkIndx]['mark'];
            let strMark = 0;
            if (new RegExp("\\b" + "REV I" + "\\b").test(arrMark[mrkIndx]['testAcr'].toUpperCase()) == true)
                strMark = (arrMark[mrkIndx]['mark'] / 100) * 5;    // LabModel into 5
            else
                strMark = (arrMark[mrkIndx]['mark'] / 100) * 7.5;   // labexperimets into 7.5
            totalMark = totalMark + strMark;
        }
        return Math.round((isNaN(totalMark) ? 0 : totalMark));
    } else if (pRegulation == "R2019" || pRegulation == "R2020") {
        let totalMark = 0;
        for (let mrkIndx = 0; mrkIndx < arrMark.length; mrkIndx++) {
            if (pObjStu != null) pObjStu[arrMark[mrkIndx]['testAcr']] = arrMark[mrkIndx]['mark'];
            let strMark = 0;
            if (new RegExp("\\b" + "REV I" + "\\b").test(arrMark[mrkIndx]['testAcr'].toUpperCase()) == true)
                strMark = (arrMark[mrkIndx]['mark'] / 100) * 10;    // REV I into 10
            else
                strMark = (arrMark[mrkIndx]['mark'] / 100) * 20;   // REV II into 20
            totalMark = totalMark + strMark;
        }
        return Math.round(isNaN(totalMark) ? 0 : totalMark);
    }
}

module.exports.PrepareClassWiseIATMark = (pResultRow) => {
    let objResult = {};
    let lstStudents = [];
    let pRows = pResultRow[0];
    let arrBatches = [];
    pResultRow[2].forEach((subject) => {
        if (!arrBatches.includes(subject.batchYear)) {
            arrBatches.push(subject.batchYear);
            objResult[subject.batchYear] = {};
        }
    });
    arrBatches.forEach((pBatchYear) => {
        let arrBatchSubjects = pResultRow[2].filter((subject) => { return subject.batchYear == pBatchYear });

        arrBatchSubjects.forEach((subject) => {

            let subType = subject.subType;

            if (subType == "P")
                pRows = pResultRow[1].filter((student) => { return (student.batchYear == pBatchYear && student.subCode == subject.subCode) });
            else
                pRows = pResultRow[0].filter((student) => { return (student.batchYear == pBatchYear && student.subCode == subject.subCode) });

            let arrStudents = pRows.map(function (obj) {
                return { "registerNo": obj.registerNo, "stuName": obj.stuName, "semester": obj.semester, "regulation": obj.regulation, 'collegeName': obj.collegeName, 'collegeCode': obj.collegeCode, 'course': obj.course, 'courseName': obj.courseName, 'deptCode': obj.deptCode, 'studentSection': obj.studentSection };
            });
            // let arrStudents = pRows;
            arrStudents = arrStudents.filter((value, index, self) => self.map(x => x.registerNo).indexOf(value.registerNo) == index)

            for (let stuIndx = 0; stuIndx < arrStudents.length; stuIndx++) {
                let strRegulation = arrStudents[stuIndx]['regulation'];
                let arrMark = pRows.filter((value) => { return value.registerNo == arrStudents[stuIndx].registerNo });
                let objStu = {
                    "RegisterNumber": arrStudents[stuIndx]['registerNo'],
                    "Name": arrStudents[stuIndx]['stuName'],
                    "studentSection": arrStudents[stuIndx]['studentSection']
                }
                let totalMark = 0;
                if (subType == "P") { // practical subject
                    objStu['Internal'] = __CalculateLabInternal(arrMark, strRegulation, objStu); // Internal Mark calculation
                } else if (subType == "C") {
                    // Theory Test - 30 , Labexper - 10, labmodel - 10 => 50 Internal and 50 External
                    // calculate theory mark (30)

                    let arrLabMark = pResultRow[1].filter(function (obj) {
                        return obj.registerNo == arrStudents[stuIndx]['registerNo'] && obj.subCode == subject.subCode
                    })

                    objStu['Internal'] = __CalculateTheoryCPracticalInternal(arrMark, arrLabMark, strRegulation, objStu);

                } else if (subType == "J") { // Project Paper

                    objStu['Internal'] = __CalculateProjectInternal(arrMark, strRegulation, objStu)
                }
                else { // theory subject
                    objStu['Internal'] = __CalculateTheoryInternal(arrMark, strRegulation, objStu);
                }
                lstStudents.push(objStu);
            }
            if (arrStudents.length > 0) {
                objResult[pBatchYear][subject.subCode] = {
                    "collegeName": arrStudents[0]['collegeName'],
                    "collegeCode": arrStudents[0]['collegeCode'],
                    "course": arrStudents[0]['course'],
                    "courseName": arrStudents[0]['courseName'],
                    "deptCode": arrStudents[0]['deptCode'],
                    "Semester": arrStudents[0]['semester'].toString().padStart(2, '0'),
                    "Regulation": arrStudents[0]['regulation'],
                    subject,
                    "studentsList": lstStudents
                };
                lstStudents = [];
            }
        });
    });
    return objResult;
}

module.exports.PrepareInternalMark = (pResultRow) => {

    let lstStudents = [];
    let pRows = pResultRow[0];
    if (pRows.length == 0)
        pRows = pResultRow[1]

    let strRegulation = (pResultRow[0].length > 0) ? pResultRow[0][0]['regulation'] : (pResultRow[1].length > 0) ? pResultRow[1][0]['regulation'] : "";


    let arrStudents = pRows.map(function (obj) { return { "registerNo": obj.registerNo, "stuName": obj.stuName, "semester": obj.semester, "regulation": obj.regulation }; });
    arrStudents = arrStudents.filter((value, index, self) => self.map(x => x.registerNo).indexOf(value.registerNo) == index)

    let arrSubject = pResultRow[2]; // subject list from class wise query result
    for (let stuIndx = 0; stuIndx < arrStudents.length; stuIndx++) {
        let subjects = []

        for (let i = 0; i < arrSubject.length; i++) {
            let mInternal = 0;
            let arrMark = [];

            if (arrSubject[i]['subType'] == "P") {
                arrMark = pResultRow[1].filter(function (obj) {
                    return obj.subCode == arrSubject[i]['subCode'] && obj.registerNo == arrStudents[stuIndx]['registerNo']
                })

                mInternal = __CalculateLabInternal(arrMark, strRegulation, null);
            } else if (arrSubject[i]['subType'] == "C") {

                arrMark = pRows.filter(function (obj) {
                    return obj.subCode == arrSubject[i]['subCode'] && obj.registerNo == arrStudents[stuIndx]['registerNo']
                })

                let arrLabMark = pResultRow[1].filter(function (obj) {
                    return obj.subCode == arrSubject[i]['subCode'] && obj.registerNo == arrStudents[stuIndx]['registerNo']
                })

                mInternal = __CalculateTheoryCPracticalInternal(arrMark, arrLabMark, strRegulation, null)

                // mInternal = __CalculateTheoryInternal(arrMark, strRegulation, null);

                // // calculate lab mark (20)
                // let arrLabMark = pResultRow[1].filter(function (obj) {
                //     return obj.subCode == arrSubject[i]['subCode'] && obj.registerNo == arrStudents[stuIndx]['registerNo']
                // })
                // let totalMark = 0;
                // for (let mrkIndx = 0; mrkIndx < arrLabMark.length; mrkIndx++) {

                //     let strMark = 0;
                //     if (arrLabMark[mrkIndx]['testAcr'].toLowerCase().indexOf('model') >= 0)
                //         strMark = (arrLabMark[mrkIndx]['mark'] / 100) * 10;    // LabModel into 20
                //     else
                //         strMark = (arrLabMark[mrkIndx]['mark'] / 100) * 10;   // labexperimets into 30
                //     totalMark = totalMark + strMark;
                // }
                // mInternal = mInternal + totalMark;
            } else if (arrSubject[i]['subType'] == "J") {
                arrMark = pRows.filter(function (obj) {
                    return obj.subCode == arrSubject[i]['subCode'] && obj.registerNo == arrStudents[stuIndx]['registerNo']
                })
                mInternal = __CalculateProjectInternal(arrMark, strRegulation, null)
            }
            else {
                arrMark = pRows.filter(function (obj) {
                    return obj.subCode == arrSubject[i]['subCode'] && obj.registerNo == arrStudents[stuIndx]['registerNo']
                })
                if (arrMark.length == 0)
                    mInternal = "-"
                else
                    mInternal = __CalculateTheoryInternal(arrMark, strRegulation, null);
            }

            let strSubKey = arrSubject[i]['subCode']
            if (mInternal != "-")
                subjects.push({ "subCode": strSubKey, "internal": Math.round(isNaN(mInternal) ? 0 : mInternal) });
        }
        lstStudents.push({
            "RegisterNumber": arrStudents[stuIndx]['registerNo'],
            "Name": arrStudents[stuIndx]['stuName'],
            "regulation": strRegulation,
            "subjects": subjects
        })
    }

    return lstStudents;
}




module.exports.PrepareLabSubjects = (pRows) => {
    let lstSubjects = pRows[0].map(function (obj) { return obj.subCode; });
    lstSubjects = lstSubjects.filter(function (v, i) { return lstSubjects.indexOf(v) == i; });
    let arrSub = [];
    for (let i = 0; i < lstSubjects.length; i++) {
        let lstTemp = pRows[0].filter(function (item) {
            return item['subCode'] == lstSubjects[i]
        })
        let lstExper = pRows[1].filter(function (item) {
            return item['subCode'] == lstSubjects[i]
        })
        let lstExperiments = [];
        let expr = [];
        if (lstExper.length > 0) {
            expr = JSON.parse(lstExper[0]['experiments'])
            for (let exprIndx = 0; exprIndx < expr.length; exprIndx++) {
                let exprUpdated = false;

                let lstTmpStu = lstTemp.map(function (obj) {
                    let mark = (obj.experimentMarks != null) ? JSON.parse(obj.experimentMarks)
                        .filter(function (item) {
                            return (item['exprId'] == expr[exprIndx]['exprId'])
                        }) : null

                    return {
                        "regNo": obj.registerNo,
                        "name": obj.stuName,
                        "mark": (mark && mark.length > 0) ? mark[0]['mark'] : null
                    }
                })

                let lstStu = lstTmpStu.filter(function (item) {
                    return item['mark'] != null
                })

                if (lstStu.length > 0) {
                    exprUpdated = true;
                }

                lstExperiments.push({
                    "exprId": expr[exprIndx]['exprId'],
                    "exprTitle": expr[exprIndx]['exprTitle'],
                    "exprName": expr[exprIndx]['exprName'],
                    "minMark": expr[exprIndx]['minMark'],
                    "maxMark": expr[exprIndx]['maxMark'],
                    "markUpdated": exprUpdated,
                    "studentList": lstTmpStu
                })
            }
        }

        arrSub.push({
            "subCode": lstTemp[0]['subCode'],
            "subName": lstTemp[0]['subName'],
            "semester": lstTemp[0]['semSubId'],
            "noOfExperiments": expr.length,
            "experiments": lstExperiments
        })
    }
    return arrSub;
}

module.exports.PrepareLabMarkEntryOverallReport = (pRows) => {
    let arrBatch = [];
    let lstBatchs = pRows[0].map(function (obj) { return obj.batch; });
    lstBatchs = lstBatchs.filter(function (v, i) { return lstBatchs.indexOf(v) == i; });

    for (let strBatchIndx = 0; strBatchIndx < lstBatchs.length; strBatchIndx++) {
        let lstBatch = pRows[0].filter(function (item) {
            return item['batch'] == lstBatchs[strBatchIndx]
        })

        let lstSections = lstBatch.map(function (obj) { return obj.section; });
        lstSections = lstSections.filter(function (v, i) { return lstSections.indexOf(v) == i; });
        let arrSection = [];
        for (let secIndx = 0; secIndx < lstSections.length; secIndx++) {

            let lstSection = lstBatch.filter(function (item) {
                return item['section'] == lstSections[secIndx]
            })

            let lstSubjects = lstSection.map(function (obj) { return obj.subId; });
            lstSubjects = lstSubjects.filter(function (v, i) { return lstSubjects.indexOf(v) == i; });
            let arrSub = [];
            for (let i = 0; i < lstSubjects.length; i++) {
                let lstTemp = lstSection.filter(function (item) {
                    return item['subId'] == lstSubjects[i]
                })
                let lstExper = pRows[1].filter(function (item) {
                    return item['subId'] == lstSubjects[i] && item['section'] == lstSections[secIndx]
                })

                let expr = [];
                let strMarkEnteredCount = 0;
                if (lstExper.length > 0) {
                    expr = JSON.parse(lstExper[0]['experiments'])

                    for (let exprIndx = 0; exprIndx < expr.length; exprIndx++) {

                        let lstTmpStu = lstTemp.map(function (obj) {
                            let mark = (obj.experimentMarks != null) ? JSON.parse(obj.experimentMarks)
                                .filter(function (item) {
                                    return (item['exprId'] == expr[exprIndx]['exprId'])
                                }) : null

                            return {
                                "regNo": obj.registerNo,
                                "name": obj.stuName,
                                "mark": (mark && mark.length > 0) ? mark[0]['mark'] : null
                            }
                        })

                        let lstStu = lstTmpStu.filter(function (item) {
                            return item['mark'] != null
                        })

                        if (lstStu.length > 0) {
                            strMarkEnteredCount = strMarkEnteredCount + 1
                        }
                    }
                }

                arrSub.push({
                    "subCode": lstTemp[0]['subCode'],
                    "subName": lstTemp[0]['subName'],
                    "semester": lstTemp[0]['semSubId'],
                    "handledBy": lstTemp[0]['staffName'],
                    "totalExpr": expr.length,
                    "markUpdatedExpr": strMarkEnteredCount,
                    "pendingExpr": expr.length - strMarkEnteredCount
                })
            }
            arrSection.push({
                "section": lstSections[secIndx],
                "subList": arrSub
            })
        }
        arrBatch.push({
            "batch": lstBatchs[strBatchIndx],
            "sectionList": arrSection
        })
    }
    return arrBatch;
}

module.exports.PrepareStaffSelectionByStudent = (pRows) => {
    let objResult = {};
    if (pRows[0].length > 0) {
        let isFinalized = 1;
        // To get unique subject list
        let arrSubjectList = pRows[0].map(function (obj) { return { "subCode": obj.subCode, "subName": obj.subName, "subType": obj.subTypeDesc, "subTypeAcr": obj.subType }; });
        arrSubjectList = arrSubjectList.filter((value, index, self) => self.map(x => x.subCode).indexOf(value.subCode) == index)

        // To prepare subject list for other than elective
        let arrOtherSubject = arrSubjectList.filter(obj => { return obj.subType.toUpperCase() != "ELECTIVE" })

        for (let subIdx = 0; subIdx < arrOtherSubject.length; subIdx++) {
            let lstSubject = pRows[0].filter(obj => { return obj.subCode == arrOtherSubject[subIdx]["subCode"] })
            arrOtherSubject[subIdx]["isFinalized"] = isFinalized
            __PrepareSubjectList(arrOtherSubject[subIdx], lstSubject)
            isFinalized = arrOtherSubject[subIdx]["isFinalized"]
            delete arrOtherSubject[subIdx]["isFinalized"];
        }

        // To prepare subject list for elective
        let arrElectives = arrSubjectList.filter(obj => { return obj.subType.toUpperCase() == "ELECTIVE" })

        let arrElectiveTypes = arrElectives.map(obj => { return { "subType": obj.subType, "subTypeAcr": obj.subTypeAcr } })
        arrElectiveTypes = arrElectiveTypes.filter((value, index, self) => self.map(x => x.subTypeAcr).indexOf(value.subTypeAcr) == index)

        let lstElectivs = [];
        for (let typIdx = 0; typIdx < arrElectiveTypes.length; typIdx++) {

            let arrElectiveSubject = arrElectives.filter(obj => { return obj.subTypeAcr == arrElectiveTypes[typIdx]["subTypeAcr"] })
            let selectedElectiveSub = null, strFinalized = 0;
            for (let subIdx = 0; subIdx < arrElectiveSubject.length; subIdx++) {

                let lstSubject = pRows[0].filter(obj => { return obj.subCode == arrElectiveSubject[subIdx]["subCode"] })

                let arrFinalized = lstSubject.filter(obj => {
                    return (obj.electiveLstId != null && obj.electiveLstId != '' && obj.electiveLstId != "null") && obj.isFinalized == 1
                })

                if (arrFinalized.length > 0) {
                    strFinalized = 1;
                }

                let selectedSub = __PrepareSubjectList(arrElectiveSubject[subIdx], lstSubject)

                if (selectedSub != null)
                    selectedElectiveSub = selectedSub;
            }
            isFinalized = strFinalized
            lstElectivs.push({
                "subTypeAcr": arrElectiveTypes[typIdx]["subTypeAcr"],
                "subType": arrElectiveTypes[typIdx]["subType"],
                "selectedSubject": selectedElectiveSub,
                "subjectList": arrElectiveSubject
            })
        }

        objResult = {
            "semester": pRows[0][0]["semester"].padStart(2, "0"),
            "academicYear": pRows[0][0]["academicYear"],
            "course": pRows[0][0]["course"],
            "dept": pRows[0][0]["dept"],
            "batch": pRows[0][0]["batch"],
            "isFinalized": isFinalized,
            "subjectList": arrOtherSubject,
            "electiveSubjectList": lstElectivs
        }
    }
    // to prepare master lock operation data
    if (pRows[1].length > 0) {
        let startTimeInSec = convertHoursToSec(moment(pRows[1][0]["startDate"]).format("HH:mm:ss"));
        let endTimeInSec = convertHoursToSec(moment(pRows[1][0]["endDate"]).format("HH:mm:ss"));
        let curTimeInSec = convertHoursToSec(moment(new Date()).format("HH:mm:ss"));
        objResult["lockInfo"] = {
            "startDate": moment(pRows[1][0]["startDate"]).format("YYYY-MM-DD hh:mm:ss"),
            "endDate": moment(pRows[1][0]["endDate"]).format("YYYY-MM-DD hh:mm:ss"),
            "curDate": moment(new Date()).format("YYYY-MM-DD hh:mm:ss"),
            "isValid": false
        }
        let startDate = moment(pRows[1][0]["startDate"], "YYYY-MM-DD");
        let endDate = moment(pRows[1][0]["endDate"], "YYYY-MM-DD");
        let todaysdate = moment(new Date(), "YYYY-MM-DD");
        let startDaysDiff = startDate.diff(todaysdate, 'days', true);
        let endDaysDiff = endDate.diff(todaysdate, 'days', true);
        if (startDaysDiff <= 0 && (startTimeInSec <= curTimeInSec)) {
            if (endDaysDiff > 0) {
                objResult["lockInfo"]["isValid"] = true;
            } else if (endDaysDiff >= 0 && (endTimeInSec >= curTimeInSec)) {
                objResult["lockInfo"]["isValid"] = true;
            }
        }
    }

    function convertHoursToSec(pHour) {
        var hms = pHour;   // your input string
        var a = hms.split(':'); // split it at the colons

        // minutes are worth 60 seconds. Hours are worth 60 minutes.
        return (+a[0]) * 60 * 60 + (+a[1]) * 60 + (+a[2]);
    }

    return objResult;
}


function __PrepareSubjectList(pSubjectList, pRows) {
    let selectedStaff = pRows.filter(obj => { return obj.electiveLstId != null && obj.electiveLstId != '' && obj.electiveLstId != 'null' })
    pSubjectList['selectedStaffSubjectId'] = null;
    pSubjectList['selectedStaffName'] = null;
    pSubjectList['selectedStaffId'] = null;
    pSubjectList['selectedElectiveLstId'] = null;
    pSubjectList['selectedStaffTitle'] = null;
    pSubjectList['selectedStatus'] = 0;
    let selectedSubCode = null
    if (selectedStaff.length > 0) {
        pSubjectList['selectedStaffSubjectId'] = selectedStaff[0]["subjectId"];
        pSubjectList['selectedStaffName'] = selectedStaff[0]["staffName"];
        pSubjectList['selectedStaffId'] = selectedStaff[0]["staffCode"];
        pSubjectList['selectedElectiveLstId'] = selectedStaff[0]["electiveLstId"];
        pSubjectList['selectedStatus'] = 1;
        pSubjectList['selectedStaffTitle'] = selectedStaff[0]["staffTitle"];
        selectedSubCode = selectedStaff[0]["subCode"]
        pSubjectList['isFinalized'] = (selectedStaff[0]["isFinalized"] == 0) ? 0 : pSubjectList['isFinalized']
    } else
        pSubjectList['isFinalized'] = 0;
    // to get available staff for the current subject
    let lstStaff = pRows.map(obj => {
        return {
            "subId": obj.subjectId,
            "electiveLstId": obj.electiveLstId,
            "staffCode": obj.staffCode,
            "staffName": obj.staffName,
            "staffTitle": obj.staffTitle,
            "staffDesig": obj.staffDesig,
            "photoUrl": obj.photoUrl,
            "selectedCount": obj.selectedStudents,
            // "staffStatus" : 1
            "staffStatus": (obj.selectedStudents >= obj.maxCapacity) ? 1 : 0
        }
    })
    pSubjectList["availableStaff"] = lstStaff
    return selectedSubCode;
}

module.exports.PrepareStudentSelectedStaffList = (pRows) => {
    let objResult = {}
    if (pRows[0].length > 0) {
        let arrUniqueStudents = pRows[0].map(obj => { return { "registerNo": obj.registerNo, "studentName": obj.studentName } })
        arrUniqueStudents = arrUniqueStudents.filter((value, index, self) => self.map(x => x.registerNo).indexOf(value.registerNo) == index)
        let lstStudents = [];
        for (let stuIdx = 0; stuIdx < arrUniqueStudents.length; stuIdx++) {
            let arrStudent = pRows[0].filter(obj => { return obj.registerNo == arrUniqueStudents[stuIdx]["registerNo"] });

            let arrUniqueSubjects = arrStudent.map(obj => { return { "subCode": obj.subCode, "subName": obj.subName } })
            arrUniqueSubjects = arrUniqueSubjects.filter((value, index, self) => self.map(x => x.subCode).indexOf(value.subCode) == index)

            let lstSubjects = [];
            for (let subIdx = 0; subIdx < arrUniqueSubjects.length; subIdx++) {
                let arrSubject = arrStudent.filter(obj => { return obj.subCode == arrUniqueSubjects[subIdx]["subCode"] });
                let objSelectedStaff = null
                let arrStaff = arrSubject.map(obj => {
                    if (obj.electiveLstId != null && obj.electiveLstId != 'null' && obj.electiveLstId != "") {
                        objSelectedStaff = obj;
                    }
                    return {
                        "subId": obj.subjectId,
                        "electiveLstId": obj.electiveLstId,
                        "staffCode": obj.staffCode,
                        "staffName": obj.staffName,
                        "staffTitle": obj.staffTitle,
                        "staffDesig": obj.staffDesig,
                        "photoUrl": obj.photoUrl
                    }
                });

                lstSubjects.push({
                    ...arrUniqueSubjects[subIdx], ...{
                        "selectedStaffSubjectId": (objSelectedStaff != null ? objSelectedStaff.subjectId : null),
                        "selectedStaffName": (objSelectedStaff != null ? objSelectedStaff["staffName"] : null),
                        "selectedElectiveLstId": (objSelectedStaff != null ? objSelectedStaff["electiveLstId"] : null),
                        "selectedStatus": (objSelectedStaff != null ? 1 : 0),
                        "availableStaff": arrStaff
                    }
                })
            }
            lstStudents.push({ ...arrUniqueStudents[stuIdx], ...{ "subjectList": lstSubjects } })
        }
        objResult = {
            "dept": pRows[0][0]["courseAcr"],
            "course": pRows[0][0]["courseDegree"] + " - " + pRows[0][0]["courseAcr"],
            "batch": pRows[0][0]["batchYear"],
            "studentList": lstStudents
        }
    }
    return objResult;
}
/**************************** Research Module*****************************/

// module.exports.PrepareStaffPublication = (pRows) => {
//     let arrDisplayColumns = ['authorNames', 'title', 'journalName', 'volumnNo', 'issueNo', 'pageNo', 'publisher', 'month', 'year', 'issnNo', 'doi', 'impactFactor', 'citation']

//     for (let i = 0; i < pRows.length; i++) {
//         let strJournal = "";
//         for (let indx = 0; indx < arrDisplayColumns.length; indx++) {

//             switch (arrDisplayColumns[indx]) {
//                 case "title":
//                     strJournal = strJournal + ', "' + pRows[i][arrDisplayColumns[indx]] + '"'
//                     break;
//                 case "volumeNo":
//                     strJournal = strJournal + ', Vol.No:' + pRows[i][arrDisplayColumns[indx]]
//                     break;
//                 case "pageNo":
//                     strJournal = strJournal + ', Page.No:' + pRows[i][arrDisplayColumns[indx]]
//                     break;
//                 case "issueNo":
//                     strJournal = strJournal + ', Issue:' + pRows[i][arrDisplayColumns[indx]]
//                     break;
//                 case "citation":
//                     strJournal = strJournal + ', Citation:' + pRows[i][arrDisplayColumns[indx]]
//                     break;
//                 case "issnNo":
//                 case "doi":
//                 case "impactFactor":
//                     let strJournalKey = "";
//                     if (arrDisplayColumns[indx] == "issnNo")
//                         strJournalKey = "ISSNNo:"
//                     else if (arrDisplayColumns[indx] == "doi")
//                         strJournalKey = "DOI:"
//                     else
//                         strJournalKey = "ImpactFactor:"
//                     if (pRows[i][arrDisplayColumns[indx]] != "" && pRows[i][arrDisplayColumns[indx]] != null && pRows[i][arrDisplayColumns[indx]] != "null")
//                         strJournal = strJournal + ', ' + strJournalKey + pRows[i][arrDisplayColumns[indx]]
//                     break;
//                 default:
//                     strJournal = strJournal + ', ' + pRows[i][arrDisplayColumns[indx]]
//                     break;
//             }
//         }

//         let strFormString = "";
//         if (pRows[i]['webOfScience'] == "Y")
//             strFormString = "Web Of Science"
//         if (pRows[i]['sci'] == "Y")
//             strFormString = (strFormString != "") ? strFormString + ", SCI" : "SCI"
//         if (pRows[i]['scopus'] == "Y")
//             strFormString = (strFormString != "") ? strFormString + ", SCOPUS" : "SCOPUS"

//         strJournal = strJournal.replace(/(^\s*,)|(,\s*$)/g, '').trim(); // trim the left and right comma
//         pRows[i]['journals'] = (strFormString != "") ? strJournal + " (" + strFormString + ")" : strJournal
//     }
//     return pRows;
// }

module.exports.PrepareStaffPublication = (pRows) => {
    let arrDisplayColumns = ['authorNames', 'title', 'journalName', 'volumeNo', 'issueNo', 'pageNo', 'monthYear', 'issnNo', 'doi', 'impactFactor', 'citation']

    for (let i = 0; i < pRows.length; i++) {
        let strJournal = "";
        let strTmp = "";
        for (let indx = 0; indx < arrDisplayColumns.length; indx++) {

            switch (arrDisplayColumns[indx]) {
                case "title":
                    strJournal = strJournal + ', "' + pRows[i][arrDisplayColumns[indx]] + '"'
                    break;
                case "volumeNo":
                    strJournal = strJournal + ', Vol.' + pRows[i][arrDisplayColumns[indx]]
                    break;
                case "pageNo":
                    strJournal = strJournal + ', Page No:' + pRows[i][arrDisplayColumns[indx]]
                    break;
                case "issueNo":
                    strJournal = strJournal + ', Issue:' + pRows[i][arrDisplayColumns[indx]]
                    break;
                case "citation":
                    strJournal = strJournal + ((pRows[i][arrDisplayColumns[indx]] != null && pRows[i][arrDisplayColumns[indx]] != "null" && pRows[i][arrDisplayColumns[indx]] != "") ? ', Citation:' + pRows[i][arrDisplayColumns[indx]] : "")
                    break;
                case "monthYear":
                    strJournal = strJournal + ', ' + (pRows[i][arrDisplayColumns[indx]] ? pRows[i][arrDisplayColumns[indx]] : '') + "."
                    break;
                case "issnNo":
                case "doi":
                case "impactFactor":
                    let strJournalKey = "";
                    if (arrDisplayColumns[indx] == "issnNo")
                        strJournalKey = "ISSN No:"
                    else if (arrDisplayColumns[indx] == "doi")
                        strJournalKey = "DOI:"
                    else
                        strJournalKey = "ImpactFactor:"
                    if (pRows[i][arrDisplayColumns[indx]] != "" && pRows[i][arrDisplayColumns[indx]] != null && pRows[i][arrDisplayColumns[indx]] != "null")
                        strTmp = strTmp + ', ' + strJournalKey + pRows[i][arrDisplayColumns[indx]]
                    break;
                default:
                    strJournal = strJournal + ', ' + pRows[i][arrDisplayColumns[indx]]
                    break;
            }
        }

        let strFormString = "";
        if (pRows[i]['webOfScience'] == "Y")
            strFormString = "Web Of Science"
        if (pRows[i]['sci'] == "Y")
            strFormString = (strFormString != "") ? strFormString + ", SCI" : "SCI"
        if (pRows[i]['scopus'] == "Y")
            strFormString = (strFormString != "") ? strFormString + ", SCOPUS" : "SCOPUS"

        strTmp = strTmp.replace(/(^\s*,)|(,\s*$)/g, '').trim(); // trim the left and right comma
        strJournal = strJournal.replace(/(^\s*,)|(,\s*$)/g, '').trim(); // trim the left and right comma
        strFormString = (strFormString != "") ? (strTmp ? strTmp : '') + ", (" + strFormString + ")" : strTmp;
        pRows[i]['journals'] = (strFormString != "") ? strJournal + " (" + strFormString + ")" : strJournal
    }
    return pRows;
}

module.exports.PrepareLockOperationInfo = (pRows) => {
    let objLockInfo = {
        "isValid": false
    };
    if (pRows && pRows.length > 0) {
        let startTimeInSec = convertHoursToSec(moment(pRows[0]["startDate"]).format("HH:mm:ss"));
        let endTimeInSec = convertHoursToSec(moment(pRows[0]["endDate"]).format("HH:mm:ss"));
        let curTimeInSec = convertHoursToSec(moment(new Date()).format("HH:mm:ss"));
        objLockInfo = {
            "startDate": moment(pRows[0]["startDate"]).format("YYYY-MM-DD hh:mm:ss"),
            "endDate": moment(pRows[0]["endDate"]).format("YYYY-MM-DD hh:mm:ss"),
            "curDate": moment(new Date()).format("YYYY-MM-DD hh:mm:ss"),
            "isValid": false
        }
        let startDate = moment(pRows[0]["startDate"], "YYYY-MM-DD");
        let endDate = moment(pRows[0]["endDate"], "YYYY-MM-DD");
        let todaysdate = moment(new Date(), "YYYY-MM-DD");
        let startDaysDiff = startDate.diff(todaysdate, 'days', true);
        let endDaysDiff = endDate.diff(todaysdate, 'days', true);
        if (startDaysDiff <= 0 && (startDaysDiff == 0 ? startTimeInSec <= curTimeInSec : true)) {
            if (endDaysDiff > 0) {
                objLockInfo["isValid"] = true;
            } else if (endDaysDiff >= 0 && (endDaysDiff == 0 ? endTimeInSec >= curTimeInSec : true)) {
                objLockInfo["isValid"] = true;
            }
        }
    }
    return objLockInfo;

    function convertHoursToSec(pHour) {
        var hms = pHour;   // your input string
        var a = hms.split(':'); // split it at the colons

        // minutes are worth 60 seconds. Hours are worth 60 minutes.
        return (+a[0]) * 60 * 60 + (+a[1]) * 60 + (+a[2]);
    }
}

module.exports.PrepareStudentProfileData = (pRows) => {

    /* Disciplinary Activity */
    for (let all of pRows[3]) {
        all['tinyBookTime'] = moment(all['bookedTime']).format("DD-MM-YYYY hh:mm:ss a")
        all['tinyHodRevDate'] = moment(all['hodTime']).format("DD-MM-YYYY hh:mm:ss a")
        all['tinyMentRevDate'] = moment(all['mentorTime']).format("DD-MM-YYYY hh:mm:ss a")
    }
    pRows.splice(pRows.length - 1, 1);  

    /** To get Total Rewards Points  */
    let totalRewards = 0;
    pRows[4] = pRows[4] ? pRows[4] : [];
    for (let rewards of pRows[4]) {
        totalRewards += rewards.rewardPoints
    }
    pRows[0][0]['totalRewards'] = totalRewards;
    let arrDocuments = pRows[1].map(obj => {
        obj["docExt"] = reqFileHandler.GetFileExtension(obj.docUrl).substring(1); return obj
    })
    if (pRows[0].length > 0) {
        pRows[0][0]['verificationStatus'] = ((pRows[0][0]["secondaryStatus"] == 0 || pRows[0][0]["eduStatus"] == 0 || pRows[0][0]["docVerifiedStatus"] == 0) ? 0 : 1)
        pRows[0][0]['year'] = pRows[0][0]['year'] ? this.convertRomanian(pRows[0][0]['year']) : ''
    }
    let objResult = {
        "profileData": pRows[0].length > 0 ? pRows[0][0] : {},
        "educationDocuments": (pRows[2].length > 0 ? pRows[2].map(obj => {
            obj.docName = JSON.parse(obj.docName).sort(function (a, b) {
                return a.order - b.order
            }); return obj;
        }) : []),
        //this.PrepareEducationalDocumentList(pRows[2]),
        "attachedDocuments": arrDocuments,
        "disciplinaryActivity": pRows[3],       
        "earnedRewards": pRows[5]
    }
    return objResult;

}
/***************************End of research Module ***********************/

module.exports.PrepareSASSplitupStatusReport = (pRows) => {
    let objResult = { "sectionList": [], "subjectList": [] };
    if (pRows.length > 0) {
        objResult["dept"] = pRows[0]["dept"];
        objResult['oprnCount'] = pRows[0]["oprnCount"];
        // To get unique subjects
        let arrUniqueSubjects = pRows.map(obj => { return { "subCode": obj.subCode, "subName": obj.subName, "subType": obj.subType } })
        arrUniqueSubjects = arrUniqueSubjects.filter((value, index, self) => self.map(x => x.subCode).indexOf(value.subCode) == index)

        // To get unique sections
        let arrUniqueSection = pRows.map(function (obj) { return obj.studentSection; })
        arrUniqueSection = arrUniqueSection.filter(function (v, i) { return arrUniqueSection.indexOf(v) === i; });

        for (let subIdx = 0; subIdx < arrUniqueSubjects.length; subIdx++) {
            let arrSubject = pRows.filter(obj => { return obj.subCode == arrUniqueSubjects[subIdx]["subCode"] });

            // To get unique students
            let arrUniqueStudents = arrSubject.map(obj => { return { "studRegNo": obj.registerNo, "studName": obj.studentName, "studBatch": obj.batchYear, "studSection": obj.studentSection, "sasFirstStatus": obj.sasFirstStatus, "sasSecondStatus": obj.sasSecondStatus } })
            arrUniqueStudents = arrUniqueStudents.filter((value, index, self) => self.map(x => x.studRegNo).indexOf(value.studRegNo) == index)

            arrUniqueSubjects[subIdx]["selectedStudents"] = arrUniqueStudents;
        }
        objResult["sectionList"] = arrUniqueSection;
        objResult["subjectList"] = arrUniqueSubjects;

        // To get unique students
        let arrUniqueStudents = pRows.map(obj => { return { "studRegNo": obj.registerNo, "studName": obj.studentName, "studBatch": obj.batchYear, "studSection": obj.studentSection } })
        arrUniqueStudents = arrUniqueStudents.filter((value, index, self) => self.map(x => x.studRegNo).indexOf(value.studRegNo) == index)

        arrUniqueStudents.forEach(function (objStu, idx) {

            let arrSubList1 = pRows.filter(obj => { return obj.registerNo == objStu["studRegNo"] && obj.sasFirstStatus == 0 });
            objStu["sasFirstStatus"] = 1

            if (arrSubList1.length > 0)
                objStu["sasFirstStatus"] = 0

            let arrSubList2 = pRows.filter(obj => { return obj.registerNo == objStu["studRegNo"] && obj.sasSecondStatus == 0 });
            objStu["sasSecondStatus"] = 1
            if (arrSubList2.length > 0)
                objStu["sasSecondStatus"] = 0

            let arrSubList = pRows.filter(obj => { return obj.registerNo == objStu["studRegNo"] }).map(itm => {
                return {
                    "subId": itm.subId,
                    "subCode": itm.subCode,
                    "subName": itm.subName,
                    "subType": itm.subType,
                    "sasFirstStatus": itm.sasFirstStatus,
                    "sasSecondStatus": itm.sasSecondStatus
                }
            });

            objStu["courseList"] = arrSubList;
        })
        objResult["studentList"] = arrUniqueStudents;
    }
    return objResult;
}

module.exports.PrepareSASActivityInfo = (pRows) => {
    let arrUniqueActivity = [];
    if (pRows[0].length > 0) {
        arrUniqueActivity = pRows[0].map(function (obj) {
            return {
                "activityId": obj["activityId"],
                "activityType": obj["activityType"],
                "activityGrp": obj["activityGrp"],
                "activityCode": obj["activityCode"],
                "activityName": obj["activityName"],
                "activityFromDate": moment(obj["activityFromDate"]).format("YYYY-MM-DD"),
                "activityToDate": moment(obj["activityToDate"]).format("YYYY-MM-DD"),
                "activityMaxMark": obj["activityMaxMark"],
                "staffIncharge": obj["staffIncharge"] ? JSON.parse(obj["staffIncharge"]) : [],
                "resourcePerson": obj["resourcePerson"] ? JSON.parse(obj["resourcePerson"]) : [],
                "duration": obj["duration"],
                "level": obj["level"],
                "skillShift": obj["skillShift"],
                "skillInTime": obj["skillInTime"],
                "skillOutTime": obj["skillOutTime"],
                "activityStatus": obj["activityStatus"]
            }
        });
        arrUniqueActivity = arrUniqueActivity.filter((value, index, self) => self.map(x => x.activityId).indexOf(value.activityId) == index)

        for (let indx = 0; indx < arrUniqueActivity.length; indx++) {
            let arrStudents = pRows[0]
                .filter(itm => {
                    return itm.activityId == arrUniqueActivity[indx]["activityId"] && (itm.regNo != null && itm.regNo != "null" && itm.regNo != "")
                })
                .map(obj => {
                    return {
                        "regNo": obj.regNo, "studName": obj.studName, "photoUrl": obj.photoUrl, "courseAcr": obj.courseAcr,
                        "courseDegree": obj.courseDegree, "batchYear": obj.batchYear, "semester": obj.semester,
                        "requisitionStatus": obj.requisitionStatus
                    }
                })

            arrUniqueActivity[indx]["studentList"] = arrStudents;
        }
    }
    return arrUniqueActivity;
}
module.exports.PrepareGrafanaIATMarkReport = (pResultRow) => {
    let lstSubject = [];

    let pRows = pResultRow[0];
    let strRegulation = (pResultRow[0].length > 0) ? pResultRow[0][0]['regulation'] : (pResultRow[1].length > 0) ? pResultRow[1][0]['regulation'] : "";
    let arrStudents = pRows.map(function (obj) { return { "registerNo": obj.registerNo, "stuName": obj.stuName, "semester": obj.semester, "regulation": obj.regulation }; });
    arrStudents = arrStudents.filter((value, index, self) => self.map(x => x.registerNo).indexOf(value.registerNo) == index)

    let arrSubject = pResultRow[2]; // subject list from class wise query result
    for (let stuIndx = 0; stuIndx < arrStudents.length; stuIndx++) {
        for (let i = 0; i < arrSubject.length; i++) {
            let strSubKey = arrSubject[i]['subCode'] + '-' + arrSubject[i]['subAcrn'] + "(" + arrSubject[i]['subType'] + ")"
            let strSubject = { "Subject": strSubKey, "CAT I": "-", "CAT II": "-", "FAT I": "-", "FAT II": "-", "FAT III": "-", "LabExpr": "-", "LabModel": "-", "Internal": "-" }
            let mInternal = 0;
            let arrMark = [];

            if (arrSubject[i]['subType'] == "P") {
                arrMark = pResultRow[1].filter(function (obj) {
                    return obj.subCode == arrSubject[i]['subCode'] && obj.registerNo == arrStudents[stuIndx]['registerNo']
                })

                mInternal = __CalculateLabInternal(arrMark, strRegulation, strSubject);
            } else if (arrSubject[i]['subType'] == "C") { // Theory come practical paper 
                // Theory Test - 30 , Labexper - 10, labmodel - 10   => 50 Internal and 50 External
                // calculate theory mark (30)
                arrMark = pRows.filter(function (obj) {
                    return obj.subCode == arrSubject[i]['subCode'] && obj.registerNo == arrStudents[stuIndx]['registerNo']
                })

                // calculate lab mark (20)
                let arrLabMark = pResultRow[1].filter(function (obj) {
                    return obj.subCode == arrSubject[i]['subCode'] && obj.registerNo == arrStudents[stuIndx]['registerNo']
                })

                if (arrMark.length == 0 && arrLabMark.length == 0)
                    mInternal = "-"
                else
                    mInternal = __CalculateTheoryCPracticalInternal(arrMark, arrLabMark, strRegulation, strSubject)
            }
            else if (arrSubject[i]['subType'] == "D") { // Theory come practical paper 
                // Theory Test - 30 , Labexper - 10, labmodel - 10   => 50 Internal and 50 External
                // calculate theory mark (30)
                arrMark = pRows.filter(function (obj) {
                    return obj.subCode == arrSubject[i]['subCode'] && obj.registerNo == arrStudents[stuIndx]['registerNo']
                })

                // calculate lab mark (20)
                let arrLabMark = pResultRow[1].filter(function (obj) {
                    return obj.subCode == arrSubject[i]['subCode'] && obj.registerNo == arrStudents[stuIndx]['registerNo']
                })

                if (arrMark.length == 0 && arrLabMark.length == 0)
                    mInternal = "-"
                else
                    mInternal = __CalculatePracticalCTheoryInternal(arrMark, arrLabMark, strRegulation, strSubject)
            } else if (arrSubject[i]['subType'] == "J") { // Project Paper
                arrMark = pRows.filter(function (obj) {
                    return obj.subCode == arrSubject[i]['subCode'] && obj.registerNo == arrStudents[stuIndx]['registerNo']
                })
                mInternal = __CalculateProjectInternal(arrMark, strRegulation, strSubject)
            }
            // else if (arrSubject[i]['subType'] == "Z") {
            //     arrMark = pRows.filter(function (obj) {
            //         return obj.subCode == arrSubject[i]['subCode'] && obj.registerNo == arrStudents[stuIndx]['registerNo']
            //     })
            //     mInternal = __CalculateZeroCreditTheoryInternal(arrMark, strRegulation, null);
            // } else if (arrSubject[i]['subType'] == "Y") {
            //     arrMark = pResultRow[1].filter(function (obj) {
            //         return obj.subCode == arrSubject[i]['subCode'] && obj.registerNo == arrStudents[stuIndx]['registerNo']
            //     })
            //     mInternal = __CalculateZeroCreditWithPracticalInternal(arrMark, strRegulation, null);
            // }
            else {
                arrMark = pRows.filter(function (obj) {
                    return obj.subCode == arrSubject[i]['subCode'] && obj.registerNo == arrStudents[stuIndx]['registerNo']
                })

                // for MBA there is no mark for particular subjects and particular students
                if (arrMark.length == 0)
                    mInternal = "-"
                else
                    mInternal = __CalculateTheoryInternal(arrMark, strRegulation, strSubject);
            }


            strSubject["Internal"] = (mInternal == "-") ? mInternal : (Math.round((isNaN(mInternal) ? 0 : mInternal)));

            lstSubject.push(strSubject);
        }

        // To replace null/space into "-" string
        for (let subIdx = 0; subIdx < lstSubject.length; subIdx++) {
            lstSubject[subIdx]["CAT I"] = (lstSubject[subIdx]["CAT I"] == "" || lstSubject[subIdx]["CAT I"] == "null" || lstSubject[subIdx]["CAT I"] == null) ? "-" : lstSubject[subIdx]["CAT I"]
            lstSubject[subIdx]["CAT II"] = (lstSubject[subIdx]["CAT II"] == "" || lstSubject[subIdx]["CAT II"] == "null" || lstSubject[subIdx]["CAT II"] == null) ? "-" : lstSubject[subIdx]["CAT II"]
            lstSubject[subIdx]["FAT I"] = (lstSubject[subIdx]["FAT I"] == "" || lstSubject[subIdx]["FAT I"] == "null" || lstSubject[subIdx]["FAT I"] == null) ? "-" : lstSubject[subIdx]["FAT I"]
            lstSubject[subIdx]["FAT II"] = (lstSubject[subIdx]["FAT II"] == "" || lstSubject[subIdx]["FAT II"] == "null" || lstSubject[subIdx]["FAT II"] == null) ? "-" : lstSubject[subIdx]["FAT II"]
            lstSubject[subIdx]["FAT III"] = (lstSubject[subIdx]["FAT III"] == "" || lstSubject[subIdx]["FAT III"] == "null" || lstSubject[subIdx]["FAT III"] == null) ? "-" : lstSubject[subIdx]["FAT III"]
            lstSubject[subIdx]["LabExpr"] = (lstSubject[subIdx]["LabExpr"] == "" || lstSubject[subIdx]["LabExpr"] == "null" || lstSubject[subIdx]["LabExpr"] == null) ? "-" : lstSubject[subIdx]["LabExpr"]
            lstSubject[subIdx]["LabModel"] = (lstSubject[subIdx]["LabModel"] == "" || lstSubject[subIdx]["LabModel"] == "null" || lstSubject[subIdx]["LabModel"] == null) ? "-" : lstSubject[subIdx]["LabModel"]
            lstSubject[subIdx]["Internal"] = (lstSubject[subIdx]["Internal"] == "" || lstSubject[subIdx]["Internal"] == "null" || lstSubject[subIdx]["Internal"] == null) ? "-" : lstSubject[subIdx]["Internal"]
        }


        // // To remove all fields are null value column
        // Object.keys(lstSubject[0]).forEach(function (key) {
        //     let tmp = lstSubject.filter(obj => { return obj[key] == "-" })
        //     if (tmp.length == lstSubject.length) {
        //         for (let subIdx = 0; subIdx < lstSubject.length; subIdx++)
        //             delete lstSubject[subIdx][key]
        //     }
        // })
    }
    return lstSubject;
}