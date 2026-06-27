# Master Content Migration - Testing Guide

## Quick Test Checklist

### Backend API Tests

#### 1. Test List Content (GET)
```bash
# List all content with pagination
curl -X GET "http://localhost:3000/api/listContent?page=1&rowsPerPage=10&sortBy=content_id&descending=true" \
  -H "Authorization: Bearer YOUR_TOKEN"

# List with search filter
curl -X GET "http://localhost:3000/api/listContent?page=1&rowsPerPage=10&filter=test" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

#### 2. Test Get Klasifikasi Dropdown (GET)
```bash
curl -X GET "http://localhost:3000/api/getSelectKlasifikasi" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

#### 3. Test Get SubFolder1 Dropdown (GET)
```bash
# Get all subfolder1
curl -X GET "http://localhost:3000/api/getSelectSubFolder1Content" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Get subfolder1 by folder
curl -X GET "http://localhost:3000/api/getSelectSubFolder1Content?idfolder=1" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

#### 4. Test Get SubFolder2 Dropdown (GET)
```bash
# Get all subfolder2
curl -X GET "http://localhost:3000/api/getSelectSubFolder2" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Get subfolder2 by subfolder1
curl -X GET "http://localhost:3000/api/getSelectSubFolder2?idsubfolder1=1" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

#### 5. Test Create Content (POST)
```bash
curl -X POST "http://localhost:3000/api/saveContent" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "content_no": "DOC-001",
    "content_name": "Test Document",
    "content_iddiv": 1,
    "content_iddept": 1,
    "content_idfolder": 1,
    "content_revision": 0,
    "content_active": 1,
    "content_klasifikasi": "UMUM",
    "creator": "ENCRYPTED_EMPID"
  }'
```

#### 6. Test Update Content (POST)
```bash
curl -X POST "http://localhost:3000/api/saveContent" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "id": 1,
    "content_no": "DOC-001",
    "content_name": "Updated Document",
    "content_iddiv": 1,
    "content_iddept": 1,
    "content_idfolder": 1,
    "content_revision": 1,
    "content_note_revision": "Updated version",
    "content_active": 1,
    "creator": "ENCRYPTED_EMPID"
  }'
```

#### 7. Test Toggle Status (POST)
```bash
curl -X POST "http://localhost:3000/api/toggleContentStatus" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "id": 1,
    "content_active": 0,
    "creator": "ENCRYPTED_EMPID"
  }'
```

#### 8. Test Delete Content (POST)
```bash
curl -X POST "http://localhost:3000/api/deleteContent" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "id": 1,
    "creator": "ENCRYPTED_EMPID"
  }'
```

#### 9. Test Get Content By ID (GET)
```bash
curl -X GET "http://localhost:3000/api/getContentById?id=1" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### Frontend Manual Tests

#### 1. Navigation Test
- [ ] Access URL: `http://localhost:5173/#/master/content`
- [ ] Verify old URL redirects: `http://localhost:5173/#/master_content` → `/master/content`
- [ ] Check page title and breadcrumb display correctly
- [ ] Verify icon (description) displays in header

#### 2. Permission Test
- [ ] Login as user without permissions → should redirect to 404
- [ ] Login as user with view permission → can see table but no action buttons
- [ ] Login as user with add permission → can see "Tambah Content" button
- [ ] Login as user with edit permission → can see edit and toggle buttons
- [ ] Login as user with delete permission → can see delete button
- [ ] Login as admin → can see all buttons

#### 3. Table Display Test
- [ ] Table loads with data
- [ ] Columns display correctly: Aksi, No Dokumen, Nama Dokumen, Plant, Departement, Folder, Revisi, Status
- [ ] Action column stays sticky when scrolling horizontally
- [ ] Pagination works (page numbers, next/prev)
- [ ] Rows per page dropdown works (5, 10, 25, 50, 100, 200)
- [ ] Search filter works (searches in no dokumen, nama dokumen, plant, dept, folder)
- [ ] Column sorting works (click header to sort)

#### 4. Add Content Test
- [ ] Click "Tambah Content" button → dialog opens
- [ ] Dialog title shows "Tambah Content"
- [ ] Required field banner displays
- [ ] All fields are empty/default values
- [ ] Try to save without filling required fields → validation errors appear
- [ ] Fill only "No Dokumen" → validation error for other required fields
- [ ] Fill all required fields → Save button works

#### 5. Cascading Dropdown Test
**Add Mode:**
- [ ] Initially: Departement, Folder, SubFolder1, SubFolder2 are disabled
- [ ] Select Plant → Departement dropdown enabled and loaded
- [ ] Select Departement → Folder dropdown enabled and loaded
- [ ] Select Folder → SubFolder1 dropdown enabled and loaded
- [ ] Select SubFolder1 → SubFolder2 dropdown enabled and loaded
- [ ] Change Plant → Departement, Folder, SubFolder1, SubFolder2 reset and disabled
- [ ] Change Departement → Folder, SubFolder1, SubFolder2 reset and disabled
- [ ] Change Folder → SubFolder1, SubFolder2 reset and disabled
- [ ] Change SubFolder1 → SubFolder2 reset and disabled

**Edit Mode:**
- [ ] Open edit dialog → all cascade dropdowns pre-populated
- [ ] Change Plant → dependent fields reset properly
- [ ] SubFolder1 and SubFolder2 are optional (can be cleared)

#### 6. Form Field Test
- [ ] **No Dokumen** - max 50 chars, counter shows, required
- [ ] **Nama Dokumen** - max 200 chars, counter shows, required
- [ ] **Plant** - dropdown required, loads options
- [ ] **Departement** - dropdown required, cascading
- [ ] **Folder** - dropdown required, cascading
- [ ] **Sub Folder 1** - dropdown optional, cascading, clearable
- [ ] **Sub Folder 2** - dropdown optional, cascading, clearable
- [ ] **Klasifikasi** - dropdown optional, shows UMUM/TERBATAS/RAHASIA
- [ ] **Revisi** - number input, accepts only numbers
- [ ] **Tanggal Entry** - date picker icon opens calendar, date format YYYY-MM-DD
- [ ] **Tanggal Efektif** - date picker icon opens calendar, date format YYYY-MM-DD
- [ ] **File Name** - text input, max 200 chars
- [ ] **File Name 1** - text input, max 200 chars
- [ ] **Catatan Revisi** - textarea, max 500 chars, counter shows

#### 7. Save Content Test
- [ ] Fill all required fields correctly
- [ ] Click Save → confirmation dialog appears
- [ ] Click "Batal" → dialog closes, no save
- [ ] Click "Ya, Simpan" → data saves, success notification, dialog closes, table refreshes
- [ ] New content appears in table
- [ ] Try to create duplicate document number (same no + active) → error message

#### 8. Edit Content Test
- [ ] Click edit icon on a row → dialog opens with "Edit Content" title
- [ ] All fields pre-populated with existing data
- [ ] All cascade dropdowns loaded with correct options
- [ ] Change some fields
- [ ] Click Save → confirmation dialog
- [ ] Confirm → data updates, success notification, table refreshes
- [ ] Edited data reflects in table

#### 9. Delete Content Test
- [ ] Click delete icon → confirmation dialog with content name
- [ ] Click "Batal" → no deletion
- [ ] Click delete again → confirm deletion
- [ ] Click "Ya, Hapus" → content deleted (soft delete), success notification, table refreshes
- [ ] Deleted content no longer appears in table
- [ ] Check database: deleted_at and deleted_by should be set

#### 10. Toggle Status Test
- [ ] Find content with active status (toggle is ON/green)
- [ ] Click toggle → changes to inactive (OFF)
- [ ] Success notification appears
- [ ] Table refreshes automatically
- [ ] Toggle again → changes back to active
- [ ] Status persists after page refresh

#### 11. Search/Filter Test
- [ ] Enter document number in search → filters correctly
- [ ] Enter document name → filters correctly
- [ ] Enter plant name → filters correctly
- [ ] Enter dept name → filters correctly
- [ ] Enter folder name → filters correctly
- [ ] Clear search → shows all records
- [ ] Search with no results → table shows empty state

#### 12. Responsive Design Test
- [ ] Test on desktop (1920x1080) → looks good
- [ ] Test on laptop (1366x768) → looks good
- [ ] Test on tablet (768px) → dialog adapts, form is 1 column
- [ ] Test on mobile (375px) → table scrollable, dialog fullscreen

#### 13. Error Handling Test
- [ ] Disconnect internet → error notification on API calls
- [ ] Try to save with server down → error notification
- [ ] Try to delete non-existent content → error handled gracefully
- [ ] Session expired → redirects to login

---

### Database Verification Tests

#### Check Record Creation
```sql
-- Check if content was created
SELECT * FROM mContent WHERE deleted_at IS NULL ORDER BY content_id DESC LIMIT 5;

-- Check with joins
SELECT 
  c.*,
  d.divisi_name,
  dept.dept_name,
  f.folder_name,
  sf1.subfolder1_name,
  sf2.subfolder2_name
FROM mContent c
LEFT JOIN mDivisi d ON d.divisi_iddiv = c.content_iddiv
LEFT JOIN mDept dept ON dept.dept_id = c.content_iddept
LEFT JOIN mFolder f ON f.folder_id = c.content_idfolder
LEFT JOIN mFolder1 sf1 ON sf1.subfolder1_id = c.content_idsubfolder1
LEFT JOIN mFolder2 sf2 ON sf2.subfolder2_id = c.content_idsubfolder2
WHERE c.deleted_at IS NULL
ORDER BY c.content_id DESC LIMIT 5;
```

#### Check Record Update
```sql
-- Check if content was updated
SELECT content_id, content_no, content_name, content_revision, 
       updated_by, updated_at 
FROM mContent 
WHERE content_id = 1;
```

#### Check Soft Delete
```sql
-- Check if content was soft deleted
SELECT content_id, content_no, content_name, 
       deleted_by, deleted_at 
FROM mContent 
WHERE deleted_at IS NOT NULL;
```

#### Check Status Toggle
```sql
-- Check content active status
SELECT content_id, content_no, content_name, content_active 
FROM mContent 
WHERE content_id = 1;
```

#### Check Unique Constraint
```sql
-- Try to find duplicate active documents
SELECT content_no, COUNT(*) as count
FROM mContent
WHERE content_active = 1 AND deleted_at IS NULL
GROUP BY content_no
HAVING COUNT(*) > 1;
-- Should return empty (no duplicates)
```

---

### Performance Tests

#### 1. Load Test
- [ ] Create 1000+ content records
- [ ] Access list page → loads within 2 seconds
- [ ] Search with filter → results within 1 second
- [ ] Pagination → smooth navigation

#### 2. Cascade Load Test
- [ ] Select Plant with 50+ departments → loads quickly
- [ ] Select Department with 100+ folders → loads quickly
- [ ] No UI freeze during cascade loads

---

### Browser Compatibility Tests

Test on:
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)

---

### Accessibility Tests

- [ ] Keyboard navigation works (Tab, Enter, Esc)
- [ ] Screen reader can read labels
- [ ] Form validation errors are announced
- [ ] Color contrast meets WCAG standards
- [ ] Focus indicators visible

---

## Test Data Setup

### SQL to Create Test Data

```sql
-- Insert test plant
INSERT INTO mDivisi (divisi_name, divisi_note, created_at) 
VALUES ('Test Plant', 'Test plant for content', NOW());

-- Insert test department
INSERT INTO mDept (dept_name, dept_iddiv, created_at)
VALUES ('Test Department', LAST_INSERT_ID(), NOW());

-- Insert test folder
INSERT INTO mFolder (folder_name, folder_iddiv, folder_iddept, created_at)
VALUES ('Test Folder', 
  (SELECT divisi_iddiv FROM mDivisi WHERE divisi_name = 'Test Plant'),
  (SELECT dept_id FROM mDept WHERE dept_name = 'Test Department'),
  NOW());

-- Insert test subfolder1
INSERT INTO mFolder1 (subfolder1_name, subfolder1_idfolder, created_at)
VALUES ('Test SubFolder 1',
  (SELECT folder_id FROM mFolder WHERE folder_name = 'Test Folder'),
  NOW());

-- Insert test subfolder2
INSERT INTO mFolder2 (subfolder2_name, subfolder2_idsubfolder1, created_at)
VALUES ('Test SubFolder 2',
  (SELECT subfolder1_id FROM mFolder1 WHERE subfolder1_name = 'Test SubFolder 1'),
  NOW());

-- Insert test content
INSERT INTO mContent (
  content_no, content_name, content_iddiv, content_iddept, 
  content_idfolder, content_idsubfolder1, content_idsubfolder2,
  content_revision, content_klasifikasi, content_active,
  content_entry_date, content_eff_date, content_domain, created_at
)
VALUES (
  'TEST-001', 'Test Document 1',
  (SELECT divisi_iddiv FROM mDivisi WHERE divisi_name = 'Test Plant'),
  (SELECT dept_id FROM mDept WHERE dept_name = 'Test Department'),
  (SELECT folder_id FROM mFolder WHERE folder_name = 'Test Folder'),
  (SELECT subfolder1_id FROM mFolder1 WHERE subfolder1_name = 'Test SubFolder 1'),
  (SELECT subfolder2_id FROM mFolder2 WHERE subfolder2_name = 'Test SubFolder 2'),
  0, 'UMUM', 1, NOW(), NOW(), 'DMS', NOW()
);
```

### Cleanup Test Data

```sql
-- Delete test data
DELETE FROM mContent WHERE content_no LIKE 'TEST-%';
DELETE FROM mFolder2 WHERE subfolder2_name LIKE 'Test %';
DELETE FROM mFolder1 WHERE subfolder1_name LIKE 'Test %';
DELETE FROM mFolder WHERE folder_name LIKE 'Test %';
DELETE FROM mDept WHERE dept_name LIKE 'Test %';
DELETE FROM mDivisi WHERE divisi_name LIKE 'Test %';
```

---

## Common Issues & Solutions

### Issue 1: Dropdowns not loading
**Solution:** Check network tab for failed API calls, verify token is valid

### Issue 2: Cascade not working
**Solution:** Check browser console for errors, verify parent value is properly set

### Issue 3: Save returns error "Dokumen dengan nomor ini sudah ada"
**Solution:** This is validation working correctly - document number must be unique among active documents

### Issue 4: Table shows "v-model argument" warning
**Solution:** This is a known Quasar/Vue compatibility warning, can be safely ignored

### Issue 5: Date picker not opening
**Solution:** Check if q-date component is properly registered in Quasar config

---

## Success Criteria

✅ All backend endpoints return correct data  
✅ All frontend features work as expected  
✅ Cascading dropdowns work smoothly  
✅ Form validation works correctly  
✅ CRUD operations work without errors  
✅ Permission control works properly  
✅ No console errors  
✅ Performance is acceptable (< 2s page load)  
✅ Responsive design works on all screen sizes  
✅ Old URL redirects work  

---

## Sign-off

- [ ] Backend Developer: _________________ Date: _______
- [ ] Frontend Developer: _________________ Date: _______
- [ ] QA Tester: _________________ Date: _______
- [ ] Product Owner: _________________ Date: _______

---

**Testing Completed:** _______________  
**Production Deployment:** _______________
