import express from "express";
import multer from "multer";

// class definition
import {
  login,
  refresh_token,
  logout,
  login_portal,
} from "../controllers/master/loginController.js";

import {
  listUserMenuByRole,
  listAksesDomain,
  listDomain,
  listUser,
  saveUser,
  deleteUser,
  saveAksesDomain,
  getHrisByNIK,
  listUserSite,
  getUserGroup,
  getActiveUsers,
  getGroups,
  saveUserGroup,
  deleteUserGroup,
  getUsers,
  saveUserData,
  toggleUserActivation,
  getUserGroupsByUser,
  saveGroup,
  deleteGroup,
} from "../controllers/master/userController.js";

import {
  listDomainMaster,
  saveDomain,
  deleteDomain,
  listSiteMaster,
  syncSite,
  saveSite,
  listMasterRole,
  saveRole,
  deleteRole,
  listRoleAkses,
  saveRoleAkses,
  getRoleAksesByPage,
  listUserRoleAkses,
  saveUserRoleAkses,
} from "../controllers/master/domainController.js";

import {
  listSiteByDomain,
  listParentMenu,
  listSubMenu,
  saveParent,
  deleteParent,
  saveSubMenu,
  deleteSubMenu,
  listCollection,
  saveCollection,
  deleteCollection,
  listCollectionDetail,
  saveCollectionDetail,
  listCollectionMenu,
  deleteCollectionDetail,
  listGrade,
} from "../controllers/master/generalController.js";
import { getProfileImages, removeProfileImage, uploadProfileImage } from "../controllers/master/beautifyController.js";
import { listCodeMaster, saveCodeMaster } from "../controllers/master/codeController.js";
import { listPermintaan } from "../controllers/WJS/PermintaanController.js";
import { listMachiningProses, saveMachiningProses, deleteMachiningProses } from "../controllers/master/machiningController.js";
import { listParts, savePart, deletePart } from "../controllers/master/partsController.js";
import { listMachines, saveMachine, deleteMachine } from "../controllers/master/machineController.js";
import { listTemplates, getTemplateParts, getTemplateMachiningProses, saveTemplate, deleteTemplate } from "../controllers/master/templateController.js";
import { listJobTypes, saveJobType, deleteJobType } from "../controllers/master/jobTypeController.js";
import { listDepartments, getDepartmentSites, saveDepartment, deleteDepartment } from "../controllers/master/departmentController.js";
import { listGroupDepartments, getAvailableDepartments, getGroupDepartments, saveGroupDepartment, deleteGroupDepartment, getGroupMenuWithCount } from "../controllers/master/groupDepartmentController.js";
import { listTJKN, listTJKNEmployee, getMonths, saveTJKN, saveTJKNEmployee, deleteTJKN, deleteTJKNEmployee } from "../controllers/master/tjknController.js";
import { listEmployees, searchEmployeeByNIK, getSections, getPositions, saveEmployee, deleteEmployee, syncEmployeesFromPortal } from "../controllers/master/employeeController.js";
import { listBreakTimes, updateBreakTime } from "../controllers/master/breakController.js";

//end class definition

//route definition
const router = express.Router();

const maxSizeImage = 1 * 1024 * 1024 ;
const maxSizeDocument = 2 * 1024 * 1024 ;
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "file");
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    if (file) {
      let ext = file.originalname.split(".");
      cb(null, uniqueSuffix + "." + ext[ext.length - 1]);
    } else {
      let ext = file.originalname.split(".");
      cb(null, null);
    }
  },
});

const fileFilter = (req, file, cb) => {
  if (file.fieldname === "fimage") { // if uploading fimage
    if (
      file.mimetype === 'image/png' ||
      file.mimetype === 'image/jpg' ||
      file.mimetype === 'image/jpeg'
    ) { // check file type to be png, jpeg, or jpg
        cb(null, true);
    }
  } else { // else uploading fdokumen
      cb(null, true);
  }
}

const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB limit 
});

//loginController
router.post("/login",login);
router.post("/logout",logout);
router.post("/login_portal",login_portal);
router.post("/refresh_token",refresh_token);

//userController
router.get('/users', listUser);
router.get('/getAksesDomains', listAksesDomain);
router.get("/getMenuAksesByUser",listUserMenuByRole);
router.get('/getDomains', listDomain);
router.post('/users', saveUser);
router.post('/deleteusers', deleteUser);
router.post('/saveAksesDomain', saveAksesDomain);
router.get('/getHrisByNIK', getHrisByNIK);
router.get('/getUserSite', listUserSite);
router.get('/getUserGroup', getUserGroup);
router.get('/getActiveUsers', getActiveUsers);
router.get('/getGroups', getGroups);
router.post('/saveUserGroup', saveUserGroup);
router.post('/deleteUserGroup', deleteUserGroup);
router.get('/getUsers', getUsers);
router.post('/saveUserData', saveUserData);
router.post('/toggleUserActivation', toggleUserActivation);
router.get('/getUserGroupsByUser', getUserGroupsByUser);
router.post('/saveGroup', saveGroup);
router.post('/deleteGroup', deleteGroup);

//domainController
router.get('/domains', listDomainMaster);
router.post('/domains', saveDomain);
router.post('/deletedomain', deleteDomain);
router.get('/sites', listSiteMaster);
router.post('/sites', syncSite);
router.post('/saveSite', saveSite);
router.get('/role', listMasterRole);
router.post('/role', saveRole);
router.post('/deleterole', deleteRole);
router.get('/roleakses', listRoleAkses);
router.post('/saveroleakses', saveRoleAkses);
router.get('/pageakses', getRoleAksesByPage);
router.get('/grantRole', listUserRoleAkses);
router.post('/saveGrantRole', saveUserRoleAkses);



//generalController
router.get('/listSiteByDomain', listSiteByDomain);
router.get("/getParentMenu",listParentMenu);
router.post('/saveParent', saveParent);
router.post('/deleteParent', deleteParent);
router.get("/getSubMenu",listSubMenu);
router.post('/saveSubMenu', saveSubMenu);
router.post('/deleteSubMenu', deleteSubMenu);
router.get("/getCollection",listCollection);
router.post("/saveCollection",saveCollection);
router.post('/deleteCollection', deleteCollection);
router.get("/getCollectionDetail",listCollectionDetail);
router.post("/saveCollectionDetail",saveCollectionDetail);
router.get("/getCollectionMenu",listCollectionMenu);
router.post("/deleteCollectionDetail",deleteCollectionDetail)
router.get("/listGrade",listGrade);

//beautifyController
router.post("/uploadProfileImage", upload.single("image"),uploadProfileImage );
router.get("/getProfileImages",getProfileImages);
router.post("/removeProfileImage",removeProfileImage)

//CodeController
router.get('/listCodeMaster', listCodeMaster);
router.post('/saveCodeMaster', saveCodeMaster);

//MachiningController
router.get('/listMachiningProses', listMachiningProses);
router.post('/saveMachiningProses', saveMachiningProses);
router.post('/deleteMachiningProses', deleteMachiningProses);

//PartsController
router.get('/listParts', listParts);
router.post('/savePart', savePart);
router.post('/deletePart', deletePart);

//MachineController
router.get('/listMachines', listMachines);
router.post('/saveMachine', saveMachine);
router.post('/deleteMachine', deleteMachine);

//TemplateController
router.get('/listTemplates', listTemplates);
router.get('/getTemplateParts', getTemplateParts);
router.get('/getTemplateMachiningProses', getTemplateMachiningProses);
router.post('/saveTemplate', saveTemplate);
router.post('/deleteTemplate', deleteTemplate);

//JobTypeController
router.get('/listJobTypes', listJobTypes);
router.post('/saveJobType', saveJobType);
router.post('/deleteJobType', deleteJobType);

//DepartmentController
router.get('/listDepartments', listDepartments);
router.get('/getDepartmentSites', getDepartmentSites);
router.post('/saveDepartment', saveDepartment);
router.post('/deleteDepartment', deleteDepartment);

//GroupDepartmentController
router.get('/listGroupDepartments', listGroupDepartments);
router.get('/getAvailableDepartments', getAvailableDepartments);
router.get('/getGroupDepartments', getGroupDepartments);
router.get('/getGroupMenuWithCount', getGroupMenuWithCount);
router.post('/saveGroupDepartment', saveGroupDepartment);
router.post('/deleteGroupDepartment', deleteGroupDepartment);

//TJKNController
router.get('/listTJKN', listTJKN);
router.get('/listTJKNEmployee', listTJKNEmployee);
router.get('/getMonths', getMonths);
router.post('/saveTJKN', saveTJKN);
router.post('/saveTJKNEmployee', saveTJKNEmployee);
router.post('/deleteTJKN', deleteTJKN);
router.post('/deleteTJKNEmployee', deleteTJKNEmployee);

//EmployeeController
router.get('/listEmployees', listEmployees);
router.get('/searchEmployeeByNIK', searchEmployeeByNIK);
router.get('/getSections', getSections);
router.get('/getPositions', getPositions);
router.post('/saveEmployee', saveEmployee);
router.post('/deleteEmployee', deleteEmployee);
router.post('/syncEmployeesFromPortal', syncEmployeesFromPortal);

//BreakController
router.get('/listBreakTimes', listBreakTimes);
router.post('/updateBreakTime', updateBreakTime);

export default router;

//end route defition

