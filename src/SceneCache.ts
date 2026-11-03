import {indexLayers} from './interaction';
import {resolveBoard,type Scene} from './scene';
import type {Layer,DocumentSource} from './sketch';
export class SceneCache{
 private indexes=new WeakMap<Layer,ReturnType<typeof indexLayers>>();
 index(root:Layer){let index=this.indexes.get(root);if(!index){index=indexLayers(root);this.indexes.set(root,index);}return index;}
 private cache=new Map<string,Scene>();
 constructor(private doc:DocumentSource,private limit=20){}
 get(board:Layer){let scene=this.cache.get(board.do_objectID);if(!scene)scene=resolveBoard(board,this.doc);this.cache.delete(board.do_objectID);this.cache.set(board.do_objectID,scene);while(this.cache.size>this.limit)this.cache.delete(this.cache.keys().next().value!);return scene;}
}
