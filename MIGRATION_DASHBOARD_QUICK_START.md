# Dashboard Migration - Quick Start Guide

## What Was Migrated
The main Dashboard with statistics cards and column chart showing document distribution by department.

## Files Created/Modified

### Backend
- ✅ **Created**: `dms-be/controllers/Report/dashboardController.js`
  - `getDashboardStats()` - Returns Prosedur, IK, Form counts
  - `getChartData()` - Returns chart data for Highcharts column chart

- ✅ **Modified**: `dms-be/router/report.js`
  - Added: `GET /getDashboardStats`
  - Added: `GET /getChartData`

### Frontend
- ✅ **Created**: `dms-fe/src/pages/Report/Dashboard.vue`
  - Statistics cards (Prosedur, IK, Form)
  - Highcharts column chart

- ✅ **Modified**: `dms-fe/src/routes/report.js`
  - Already has dashboard route

- ✅ **Modified**: `dms-fe/src/routes/router.js`
  - Updated `/` redirect to point to `/report/dashboard`
  - Updated `/dashboard` redirect to point to `/report/dashboard`

## Dashboard Features

### 1. Statistics Cards
Three colored cards showing document counts:
- **Red Card**: Total PROSEDUR documents
- **Green Card**: Total INSTRUKSI KERJA (IK) documents  
- **Yellow Card**: Total FORMULIR (FORM) documents

### 2. Column Chart
- **Title**: "Total Dokumen Per Departemen"
- **Chart Type**: Highcharts column chart
- **X-Axis**: Department names
- **Y-Axis**: Document count
- **Series**: Each folder type (grouped columns)
- **Interactive**: Hover tooltip shows folder name and count

## How to Test

### 1. Start the Backend
```bash
cd dms-be
npm start
```

### 2. Start the Frontend
```bash
cd dms-fe
npm run dev
```

### 3. Access Dashboard
Navigate to: `http://localhost:5173/#/report/dashboard`

Or just: `http://localhost:5173/` (redirects to dashboard)

## API Endpoints

### Get Dashboard Statistics
```
GET /api/report/getDashboardStats
```

**Response**:
```json
{
  "success": true,
  "data": {
    "prosedur": 25,
    "ik": 18,
    "form": 42
  }
}
```

### Get Chart Data
```
GET /api/report/getChartData
```

**Response**:
```json
{
  "success": true,
  "data": {
    "categories": ["Dept A", "Dept B", "Dept C"],
    "series": [
      {
        "name": "PROSEDUR",
        "data": [5, 8, 3]
      },
      {
        "name": "INSTRUKSI KERJA",
        "data": [3, 6, 2]
      }
    ]
  }
}
```

## Database Requirements

The dashboard queries these tables:
- `mContent` - Document records
- `mFolder` - Folder/document types
- `mDept` - Departments

Make sure these tables exist and have data.

## Dependencies

### Already Installed
- ✅ Highcharts 12.6.0 (frontend)
- ✅ Knex.js (backend)
- ✅ Quasar (frontend UI)

No additional packages needed!

## What to Check

1. **Statistics Load**: Cards show correct document counts
2. **Chart Displays**: Column chart renders properly
3. **Department Names**: X-axis shows all departments
4. **Folder Types**: Different colored columns for each folder type
5. **Tooltips**: Hover shows correct information
6. **Loading State**: Spinner displays while loading
7. **Error Handling**: Notifications show if API fails
8. **Responsive**: Works on mobile/tablet screens

## Troubleshooting

### Statistics show 0
- Check if mContent table has records with `content_active = 1`
- Check if mFolder has entries with names: 'PROSEDUR', 'INSTRUKSI KERJA', 'FORMULIR'
- Verify user domain filter is correct

### Chart is empty
- Check if mDept table has departments
- Check if mContent records are linked to valid departments
- Open browser console for errors

### API errors
- Check backend server is running on correct port
- Verify axios baseURL is configured correctly
- Check database connection

## Old vs New Routes

| Old Route | New Route |
|-----------|-----------|
| `/dashboard` | `/report/dashboard` |
| `/` (when logged in) | `/report/dashboard` |

Both old routes redirect to the new location for backward compatibility.

## Next Steps

After verifying the dashboard works:
1. Test with real data
2. Check on different screen sizes
3. Verify domain filtering works correctly
4. Test with users from different domains
5. Add to navigation menu if needed

## Notes

- Dashboard loads stats and chart data in parallel for faster performance
- Only active documents (`content_active = 1`) are counted
- Data is filtered by user's domain automatically
- Chart uses Highcharts (same as old PHP version)
- Responsive design using Tailwind CSS grid
