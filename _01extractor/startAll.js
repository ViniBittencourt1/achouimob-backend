//backend/src/startAll.js
import { fork } from 'child_process';
fork(new URL('../api/index-jf.js', import.meta.url));
fork(new URL('./index.js', import.meta.url));