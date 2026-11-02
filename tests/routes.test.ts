import test from 'node:test';
import assert from 'node:assert/strict';
import {documentPath,projectPath,revisionPath,routeFor,safeReturnPath,teamPath,workspacePath} from '../src/routes';
test('project, document and immutable revision paths round trip',()=>{
 assert.equal(projectPath('p'),'/projects/p');
 assert.deepEqual(routeFor(documentPath('p','设计 稿')),{kind:'team',projectId:'p',documentId:'设计 稿'});
 assert.deepEqual(routeFor(revisionPath('p','d','r'),'?page=page&artboard=board'),{kind:'revision',projectId:'p',documentId:'d',revisionId:'r'});
 assert.deepEqual(routeFor('/local'),{kind:'local'});
 assert.deepEqual(routeFor('/projects'),{kind:'team'});
 assert.deepEqual(routeFor('/teams/t/members'),{kind:'team',teamId:'t',section:'members'});
 assert.deepEqual(routeFor(teamPath('t')),{kind:'team',teamId:'t',section:'overview'});
 assert.deepEqual(routeFor(workspacePath('t')),{kind:'team',teamId:'t'});
 assert.deepEqual(routeFor('/register'),{kind:'team',auth:'register'});
 assert.equal(safeReturnPath('/invite/token'),'/invite/token');
 assert.equal(safeReturnPath('/login'),null);
});
test('legacy links retain their identities for authorized canonicalization',()=>{
 assert.deepEqual(routeFor('/','?team=1&project=p&document=d'),{kind:'team',projectId:'p',documentId:'d'});
 assert.deepEqual(routeFor('/','?revision=r&page=page'),{kind:'revision',revisionId:'r'});
 assert.equal(safeReturnPath('/projects/p/documents/d/revisions/r?page=page'),'/projects/p/documents/d/revisions/r?page=page');
 assert.equal(safeReturnPath('/?revision=r'), '/?revision=r');
});
test('unknown routes and external login returns are rejected',()=>{
 for(const url of ['/projects/p/documents','/projects/p/documents/d/revisions','/projects/%2Fother','/projects/%ZZ','/unknown'])assert.equal(routeFor(url).kind,'missing');
 for(const url of ['https://example.com','//example.com','/\\example.com','/unknown',null])assert.equal(safeReturnPath(url),null);
});

test('root opens the team workspace while local viewing stays explicit',()=>{assert.equal(routeFor('/').kind,'team');assert.equal(routeFor('/local').kind,'local');});

test('team settings has a direct refreshable URL',()=>{assert.equal(routeFor('/teams/t/settings').section,'settings');});
