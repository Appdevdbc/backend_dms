import dayjs from "dayjs";
import { dbDMS as db, dbHris } from "../../config/db.js";
import { logger } from "../../helpers/logger.js";
import { getErrorResponse } from "../../helpers/utils.js";

// ─── Middleware: validate API key ─────────────────────────────────────────────
export const validateRoleKey = (req, res, next) => {
  const authHeader = req.headers["roleperappsdbc2026"];
  const apiKey = req.headers["x-api-key"];

  if (!authHeader && apiKey !== "roleperappsdbc2026") {
    return res.status(401).json({ error: "Unauthorized - Invalid or missing roleperappsdbc2026 or x-api-key header" });
  }
  next();
};

export const validateSyncKey = (req, res, next) => {
  const key = req.headers["x-api-key"];
  if (!key || key !== "userperappsdbc2026") {
    return res.status(401).json({ error: "Unauthorized - Invalid or missing x-api-key header" });
  }
  next();
};

// ─── GET /api/v1/roles ────────────────────────────────────────────────────────
export const getRoles = async (req, res) => {
  try {
    const roles = await db("group_aplikasi")
      .select("grp_id as role_id", "grp_name as role_name");

    return res.status(200).json(
      roles.map((r) => ({
        role_id: r.role_id,
        role_name: r.role_name,
        is_active: true,
      }))
    );
  } catch (error) {
    logger(error, "GET /api/v1/roles");
    return res.status(500).json(getErrorResponse(error));
  }
};

// ─── GET /api/v1/bus ──────────────────────────────────────────────────────────
export const getBUs = async (req, res) => {
  try {
    const plants = await db("mDivisi")
      .select("divisi_iddiv", "divisi_name");

    return res.status(200).json(
      plants.map((p) => ({
        id: String(p.divisi_iddiv),
        bu_id: String(p.divisi_iddiv),
        name: p.divisi_name,
        is_active: "1",
      }))
    );
  } catch (error) {
    logger(error, "GET /api/v1/bus");
    return res.status(500).json(getErrorResponse(error));
  }
};

// ─── POST /api/v1/sync-users ──────────────────────────────────────────────────
export const syncUsers = async (req, res) => {
  const users = req.body.users;
  if (!users || !Array.isArray(users) || users.length === 0) {
    return res.status(400).json({ error: "users array is required and cannot be empty" });
  }

  const appsId      = req.body.apps_id ?? "";
  const syncType    = req.body.sync_type ?? "MANUAL";
  const triggeredBy = req.body.triggered_by ?? "SYSTEM";
  const nonAktifLain = req.body.non_aktif_user_lain === true || req.body.non_aktif_user_lain === "true";
  const startedAt   = dayjs();
  const results     = [];
  const processedEmpIds = [];

  for (const userData of users) {
    const empId = userData.employee_id ?? null;

    if (!empId) {
      results.push(buildResult(appsId, syncType, triggeredBy, startedAt, userData, "ERROR", "employee_id is required"));
      continue;
    }

    processedEmpIds.push(empId);
    if (!userData.domain || !Array.isArray(userData.domain) || userData.domain.length === 0) {
      results.push(buildResult(appsId, syncType, triggeredBy, startedAt, userData, "ERROR", "Harap set domain terlebih dahulu"));
      continue;
    }

    const firstDomain = userData.domain[0];
    const finalDivId = firstDomain.bu_id ?? null;
    const finalDomain = firstDomain.bu_name ?? null;
    let finalRoleId = userData.role_id ?? null;

    if (firstDomain.roles && Array.isArray(firstDomain.roles) && firstDomain.roles.length > 0) {
      finalRoleId = firstDomain.roles[0].role_id ?? finalRoleId;
    }

    const isActive = !(userData.is_active === false || userData.is_active === "false" || userData.is_active === 0 || userData.is_active === "0");

    try {
      // Upsert user in mUser table
      let user = await db("mUser").where("user_empid", empId).first();
      const oldRole     = user?.user_role ?? null;
      const oldIsActive = user ? true : null;
      let action;

      if (!isActive) {
        if (user) {
          await db("mUser").where("user_empid", empId).delete();
          action = "UPDATE";
        } else {
          action = "SKIP";
        }
      } else if (!user) {
        // Look up employee info from portal to fill other missing fields (like email, deptId)
        const hris = await dbHris("ptl_hris")
          .select("map_dept_pk", "user_email")
          .where("Emp_Id", empId)
          .where("user_active", "Active")
          .first();

        let deptId = hris?.map_dept_pk ?? 0;
        let email = userData.employee_email ?? hris?.user_email ?? null;

        await db("mUser").insert({
          user_empid:  empId,
          user_nik:    userData.employee_nik ?? empId,
          user_name:   userData.employee_name ?? "",
          user_email:  email,
          user_iddiv:  finalDivId || 0,
          user_iddept: deptId,
          user_domain: finalDomain || "",
          user_role:   finalRoleId,
          user_pass:   "aaa"
        });
        action = "INSERT";
      } else {
        const updates = {};
        if (finalRoleId !== null && user.user_role != finalRoleId) {
          updates.user_role = finalRoleId;
        }
        if (finalDivId !== null && user.user_iddiv != finalDivId) {
          updates.user_iddiv = finalDivId;
        }
        if (finalDomain !== null && user.user_domain != finalDomain) {
          updates.user_domain = finalDomain;
        }

        if (Object.keys(updates).length > 0) {
          await db("mUser")
            .where("user_empid", empId)
            .update(updates);
          action = "UPDATE";
        } else {
          action = "SKIP";
        }
      }

      results.push(buildResult(appsId, syncType, triggeredBy, startedAt, userData, "SUCCESS", null, action, oldRole, oldIsActive, isActive));
    } catch (err) {
      results.push(buildResult(appsId, syncType, triggeredBy, startedAt, userData, "ERROR", err.message, null, null, null, isActive));
    }
  }

  // Deactivate users not in payload if requested
  if (nonAktifLain && processedEmpIds.length > 0) {
    await db("mUser")
      .whereNotIn("user_empid", processedEmpIds)
      .delete();
  }

  const endedAt   = dayjs();
  const requestId = `SYNC-${startedAt.unix()}-${Math.random().toString(36).substr(2, 6)}`;
  const inserted  = results.filter((r) => r.action === "INSERT").length;
  const updated   = results.filter((r) => r.action === "UPDATE").length;
  const skipped   = results.filter((r) => r.action === "SKIP").length;
  const errors    = results.filter((r) => r.status === "ERROR").length;

  const summary = {
    status:   errors > 0 && errors === results.length ? "ERROR" : "SUCCESS",
    inserted, updated, skipped, errors,
    total:    results.length,
  };

  const finalResults = results.map((r) => ({
    ...r,
    sync_ended_at: endedAt.toISOString(),
    duration_ms:   endedAt.diff(startedAt),
    metadata: {
      sync_summary: summary,
      total_users:  results.length,
      request_id:   requestId,
      changed_at:   endedAt.toISOString(),
    },
  }));

  return res.status(200).json(finalResults);
};

// ─── Helper ───────────────────────────────────────────────────────────────────
function buildResult(appsId, syncType, triggeredBy, startedAt, userData, status, errorMsg = null, action = null, oldRole = null, oldIsActive = null, isActive = true) {
  return {
    apps_id:         appsId,
    sync_type:       syncType,
    sync_started_at: startedAt.toISOString(),
    sync_ended_at:   null,
    duration_ms:     null,
    triggered_by:    triggeredBy,
    employee_id:     userData.employee_id ?? null,
    employee_nik:    userData.employee_nik ?? null,
    employee_name:   userData.employee_name ?? null,
    employee_email:  userData.employee_email ?? null,
    role_apps:       userData.role_apps ?? null,
    role_id:         userData.role_id ?? null,
    is_active:       isActive,
    old_role:        oldRole,
    old_is_active:   oldIsActive,
    action:          action ?? "ERROR",
    status,
    error_message:   errorMsg,
    metadata:        null,
  };
}
