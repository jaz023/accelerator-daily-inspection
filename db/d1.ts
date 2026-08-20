import{env}from"cloudflare:workers";import{CREATE_DATE_INDEX,CREATE_INSPECTIONS}from"./schema";
export async function database(){if(!env.DB)throw new Error("D1 unavailable");await env.DB.batch([env.DB.prepare(CREATE_INSPECTIONS),env.DB.prepare(CREATE_DATE_INDEX)]);return env.DB}
