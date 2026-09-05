function isNetlifyRuntime() {
  if (process.env.HELPDESK_LOCAL_STORAGE === "true") return false;

  return Boolean(
    process.env.NETLIFY ||
    process.env.NETLIFY_BLOBS_CONTEXT ||
    process.env.DEPLOY_ID ||
    process.env.SITE_ID ||
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.AWS_EXECUTION_ENV ||
    process.env.LAMBDA_TASK_ROOT === "/var/task" ||
    String(__dirname).startsWith("/var/task/") ||
    String(process.cwd()).startsWith("/var/task")
  );
}

module.exports = { isNetlifyRuntime };
