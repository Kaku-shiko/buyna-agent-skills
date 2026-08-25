const allowedShells=new Set(['sidebar','topbar','hybrid']);
const allowedDensities=new Set(['compact','comfortable','spacious']);

export function validateDashboardTheme(input={}){
  const themeId=String(input.themeId??'').trim();
  const stylesheet=String(input.stylesheet??'').trim();
  const source=String(input.source??'').trim();
  const shell=String(input.shell??'').trim();
  const density=String(input.density??'').trim();
  if(!themeId)throw new TypeError('dashboard themeId is required');
  if(source!=='approved_project_design')throw new TypeError('dashboard theme must come from approved_project_design');
  if(!stylesheet)throw new TypeError('project dashboard stylesheet is required');
  if(!allowedShells.has(shell))throw new TypeError('dashboard shell is invalid');
  if(!allowedDensities.has(density))throw new TypeError('dashboard density is invalid');
  return Object.freeze({themeId,source,stylesheet,shell,density});
}
