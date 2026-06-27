# Master Content - Quick Start Guide

**For:** Developers & Users  
**Module:** Master Content (Document Management)  
**Status:** ✅ Production Ready

---

## 🚀 Quick Access

**URL:** `/#/master/content`  
**Old URL:** `/#/master_content` (auto-redirects)

---

## 📋 What is Master Content?

Master Content is a document management module that allows you to:
- Store and manage documents with hierarchical organization
- Categorize documents by Plant → Department → Folder → SubFolders
- Track document revisions and effective dates
- Control document access with classification levels
- Manage document lifecycle (active/inactive status)

---

## 🎯 Quick Actions

### Add New Document
1. Click **"Tambah Content"** button
2. Fill required fields:
   - No Dokumen (unique document number)
   - Nama Dokumen (document name)
   - Plant (select from dropdown)
   - Departement (auto-loads after plant selection)
   - Folder (auto-loads after department selection)
3. Optional: Add SubFolder1, SubFolder2, classification, dates, files
4. Click **Save** → Confirm

### Edit Document
1. Click **Edit** icon (orange button) on the document row
2. Modify fields as needed
3. Click **Save** → Confirm

### Delete Document
1. Click **Delete** icon (red button) on the document row
2. Confirm deletion
3. Document is soft-deleted (can be recovered from database)

### Toggle Document Status
1. Click the **toggle switch** in the Status column
2. Green = Active, Gray = Inactive
3. Changes are saved automatically

### Search Documents
1. Type in the search box (searches: doc number, name, plant, dept, folder)
2. Results filter in real-time
3. Clear search to show all documents

---

## 📊 Table Columns Explained

| Column | Description |
|--------|-------------|
| **Aksi** | Action buttons (Edit, Delete) |
| **No Dokumen** | Unique document number |
| **Nama Dokumen** | Document name/title |
| **Plant** | Plant/Division name |
| **Departement** | Department name |
| **Folder** | Main folder name |
| **Revisi** | Document revision number |
| **Status** | Active/Inactive toggle |

---

## 📝 Form Fields Guide

### Required Fields (*)

| Field | Type | Max Length | Description |
|-------|------|------------|-------------|
| **No Dokumen*** | Text | 50 chars | Unique document identifier |
| **Nama Dokumen*** | Text | 200 chars | Document name or title |
| **Plant*** | Dropdown | - | Select plant/division |
| **Departement*** | Dropdown | - | Select department (loads after plant) |
| **Folder*** | Dropdown | - | Select folder (loads after dept) |

### Optional Fields

| Field | Type | Max Length | Description |
|-------|------|------------|-------------|
| **Sub Folder 1** | Dropdown | - | First level subfolder (optional) |
| **Sub Folder 2** | Dropdown | - | Second level subfolder (optional) |
| **Klasifikasi** | Dropdown | - | UMUM / TERBATAS / RAHASIA |
| **Revisi** | Number | - | Document revision number |
| **Tanggal Entry** | Date | - | Document entry date |
| **Tanggal Efektif** | Date | - | Document effective date |
| **File Name** | Text | 200 chars | Primary file name |
| **File Name 1** | Text | 200 chars | Additional file name |
| **Catatan Revisi** | Textarea | 500 chars | Revision notes/description |

---

## 🔐 Permission Levels

| Permission | Can View Table | Can Add | Can Edit | Can Delete | Can Toggle Status |
|------------|----------------|---------|----------|------------|-------------------|
| **None** | ❌ | ❌ | ❌ | ❌ | ❌ |
| **View** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Add** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Edit** | ✅ | ❌ | ✅ | ❌ | ✅ |
| **Delete** | ✅ | ❌ | ❌ | ✅ | ❌ |
| **Admin** | ✅ | ✅ | ✅ | ✅ | ✅ |

*Note: Permissions are cumulative. You may have multiple permissions.*

---

## 📱 Cascading Dropdowns Explained

The form uses a hierarchical dropdown system:

```
1. Select Plant
   ↓ (loads departments for this plant)
2. Select Departement
   ↓ (loads folders for this department)
3. Select Folder
   ↓ (loads subfolders 1 for this folder)
4. Select Sub Folder 1 (optional)
   ↓ (loads subfolders 2 for this subfolder)
5. Select Sub Folder 2 (optional)
```

**Important:** 
- If you change a parent selection, all child selections will be cleared
- Dropdowns are disabled until their parent is selected
- SubFolders are optional and can be skipped

---

## 🎨 Classification Levels

| Level | Description | Use Case |
|-------|-------------|----------|
| **UMUM** | Public | General documents accessible to all |
| **TERBATAS** | Restricted | Documents with limited access |
| **RAHASIA** | Confidential | Sensitive/confidential documents |

---

## ⚡ Tips & Best Practices

### Document Numbering
- Use consistent format: `DEPT-TYPE-001`
- Example: `ENG-PROC-001` (Engineering Procedure 001)
- Keep numbers unique and meaningful

### Document Names
- Be descriptive and clear
- Include version if applicable
- Example: "Quality Management System Procedure v2.0"

### Folder Organization
- Plan your folder structure before adding documents
- Use logical grouping (by type, department, project)
- Keep hierarchy simple (prefer 2-3 levels max)

### Revisions
- Increment revision number when updating
- Add clear revision notes explaining changes
- Update effective date when revision is approved

### File Names
- Use actual file names stored in your document system
- Include extension: `document.pdf` or `procedure.docx`
- Use consistent naming convention

---

## 🔍 Search Tips

The search box filters by:
- Document number (exact or partial match)
- Document name (partial match)
- Plant name (partial match)
- Department name (partial match)
- Folder name (partial match)

**Examples:**
- Search `"ENG"` → finds all docs with ENG in number, name, or related names
- Search `"Quality"` → finds all documents with "Quality" in name
- Search `"001"` → finds all documents with "001" in their number

---

## ❌ Common Errors & Solutions

### "Dokumen dengan nomor ini sudah ada dan aktif"
**Cause:** You're trying to create a document with a number that already exists and is active  
**Solution:** Either:
- Use a different document number
- Deactivate the existing document first (if it's obsolete)
- Edit the existing document instead of creating a new one

### Dropdown not loading
**Cause:** Parent dropdown not selected or network issue  
**Solution:**
- Make sure you selected the parent dropdown first
- Check your internet connection
- Refresh the page if problem persists

### Cannot save document
**Cause:** Required fields are missing  
**Solution:** Fill all fields marked with red asterisk (*)

### Changes not reflecting
**Cause:** Table cache  
**Solution:** 
- Wait a moment for auto-refresh
- Click any sort header to manually refresh
- Refresh your browser if needed

---

## 🆘 Need Help?

### For Technical Issues
1. Check this guide first
2. Refer to [MIGRATION_CONTENT.md](./MIGRATION_CONTENT.md) for technical details
3. Contact your system administrator
4. Report bugs with screenshots and steps to reproduce

### For Business Questions
1. Consult your department supervisor
2. Review your document management procedures
3. Contact the document control team

---

## 📞 Support Contacts

- **System Administrator:** TBD
- **Help Desk:** TBD
- **Email:** support@company.com (example)
- **Phone:** +62-XXX-XXXX (example)

---

## 🎓 Training Resources

### Video Tutorials
- [ ] How to Add a Document (TBD)
- [ ] How to Edit a Document (TBD)
- [ ] How to Organize with Folders (TBD)
- [ ] Managing Document Revisions (TBD)

### Documentation
- ✅ [This Quick Start Guide](./MIGRATION_CONTENT_QUICK_START.md)
- ✅ [Technical Documentation](./MIGRATION_CONTENT.md)
- ✅ [Testing Guide](./MIGRATION_CONTENT_TEST.md)
- ✅ [Migration Status](./MIGRATION_STATUS.md)

---

## 🔄 Changelog

**Version 1.0.0** (June 25, 2026)
- Initial release
- Full CRUD functionality
- Cascading dropdown support
- Status toggle feature
- Search and filter
- Permission-based access control

---

## ✨ Features Coming Soon

- [ ] Document file upload/download
- [ ] Document preview/viewer
- [ ] Full revision history
- [ ] Bulk operations
- [ ] Export to Excel
- [ ] Email notifications
- [ ] Approval workflow

---

**Last Updated:** June 25, 2026  
**Version:** 1.0.0  
**Status:** Production Ready ✅
