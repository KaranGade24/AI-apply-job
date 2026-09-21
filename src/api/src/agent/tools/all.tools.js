import { resumeParseTool } from './resumeParse.tool.js';
import { jobDiscoveryTool } from './jobDiscover.tool.js';
import { getNextApplicationTool } from './application/getNextApplicationTool.js';
import { getApplicationMethodTool } from './application/getApplicationMethodTool.js';
import { generateResumeTool } from './application/generateResumeTool.js';
import { generateResumePdfTool } from './application/generateResumePdfTool.js';
import { sendApplicationEmailTool } from './application/sendApplicationEmailTool.js';

export const tools = [
  resumeParseTool,
  jobDiscoveryTool,
  getNextApplicationTool,
  getApplicationMethodTool,
  generateResumeTool,
  generateResumePdfTool,
  sendApplicationEmailTool
];

export default tools;
