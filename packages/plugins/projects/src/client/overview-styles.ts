export const projectOverviewCss = `
.wd-project-overview{max-width:1280px;margin:0 auto;padding:28px var(--easywork-space-page) 48px}
.wd-project-breadcrumb{display:flex;gap:12px;align-items:center;margin-bottom:34px;color:var(--easywork-muted);font-size:12px;line-height:20px}
.wd-project-breadcrumb [aria-current]{color:var(--easywork-ink)}
.wd-project-overview .easywork-page-header{margin-bottom:36px}
.wd-project-overview h2{margin:0;font-size:17px;font-weight:600;line-height:26px}
.wd-project-recent{margin-bottom:36px}
.wd-project-recent h2{margin-bottom:16px}
.wd-project-feature{display:flex;align-items:center;gap:18px;padding:22px 20px}
.wd-project-icon{display:inline-grid;place-items:center;width:40px;height:40px;flex-shrink:0;border-radius:10px;background:var(--easywork-hover);color:var(--easywork-muted)}
.wd-project-icon-accent{width:56px;height:56px;background:var(--easywork-accent-soft);color:var(--easywork-accent);border-radius:12px}
.wd-project-feature-body{flex:1;min-width:0;overflow-wrap:anywhere}
.wd-project-feature h3{margin:0;font-size:15px;line-height:24px;font-weight:600}
.wd-project-feature p{margin:5px 0;color:var(--easywork-muted);font-size:13px;line-height:22px}
.wd-project-feature small{color:var(--easywork-muted);font-size:12px;line-height:20px}
.wd-project-section-header{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:16px}
.wd-project-filters{justify-content:flex-end;flex-wrap:wrap;margin-bottom:0}
.wd-project-filters .wd-form-input{width:180px;min-width:0}
.wd-project-filters .wd-form-select{font-size:12px}
.wd-project-table{border-collapse:collapse;width:100%;table-layout:fixed;text-align:left}
.wd-project-table th{padding:9px 16px;background:var(--easywork-hover);color:var(--easywork-muted);font-size:12px;line-height:20px;font-weight:400}
.wd-project-table th:first-child{border-radius:6px 0 0 6px}
.wd-project-table th:last-child{width:110px;border-radius:0 6px 6px 0}
.wd-project-table .wd-project-date{width:115px;font-size:12px;color:var(--easywork-muted)}
.wd-project-table td{border-bottom:1px solid var(--easywork-line);padding:0 16px;vertical-align:middle}
.wd-project-table td:first-child{padding:0}
.wd-project-table tbody tr:hover{background:var(--easywork-hover)}
.wd-project-open{display:flex;align-items:center;gap:13px;min-height:78px;padding:16px;width:100%;text-align:left;border:0;background:none;color:var(--easywork-ink)}
.wd-project-open>span:last-child{min-width:0;flex:1}
.wd-project-open strong{display:block;font-size:14px;line-height:22px;font-weight:500;overflow-wrap:anywhere}
.wd-project-open small{display:block;margin-top:3px;color:var(--easywork-muted);font-size:12px;line-height:20px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wd-project-row-actions{display:flex;align-items:center;justify-content:flex-end;gap:4px}
.wd-project-row-actions [data-wd-control]{color:var(--easywork-muted)}
.wd-project-count{margin:15px 0 0;color:var(--easywork-muted);font-size:12px;line-height:20px}
.wd-project-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
.wd-project-templates{margin-top:34px;border-top:1px solid var(--easywork-line);padding-top:20px}
.wd-project-templates summary{display:flex;align-items:center;gap:8px;width:fit-content;list-style:none;cursor:pointer;font-size:13px;color:var(--easywork-muted)}
.wd-project-templates summary::-webkit-details-marker{display:none}
.wd-project-templates[open] summary svg{transform:rotate(180deg)}
.wd-project-template-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(245px,1fr));gap:16px;margin-top:18px}
.wd-project-template{display:flex;gap:14px;align-items:center;text-align:left;min-width:0;padding:18px}
.wd-project-template>span{flex:1;min-width:0}
.wd-project-template strong{display:block;font-size:14px;font-weight:500;line-height:22px}
.wd-project-template small{display:block;margin-top:5px;font-size:12px;line-height:20px;color:var(--easywork-muted)}
.wd-project-template:hover{background:var(--easywork-hover)}
.wd-project-overview button:focus-visible,.wd-project-templates summary:focus-visible{outline:2px solid var(--easywork-accent);outline-offset:3px}
@container(max-width:640px){
 .wd-project-overview .easywork-page-header,.wd-project-section-header{flex-wrap:wrap}
 .wd-project-filters{width:100%;justify-content:flex-start}
 .wd-project-filters .wd-form-input{flex:1;width:auto}
 .wd-project-table .wd-project-date{display:none}
 .wd-project-feature{display:grid;grid-template-columns:44px minmax(0,1fr);gap:14px;padding:18px}
 .wd-project-icon-accent{width:44px;height:44px}
 .wd-project-feature>[data-wd-control]{grid-column:2;justify-self:start}
 .wd-project-table th:last-child{width:95px}
 .wd-project-table td{padding:0 8px}
 .wd-project-open{padding:14px 8px;gap:10px}
 .wd-project-open .wd-project-icon{width:32px;height:32px}
 .wd-project-template-list{grid-template-columns:minmax(0,1fr)}
}
`;
