import { logJobEvent } from "../../utils/logger.js";

export const attachDialogHandler = (page, applicationId = "") => {
  if (!page || typeof page.on !== "function") return;

  page.on("dialog", async (dialog) => {
    try {
      const type = dialog.type();
      const message = dialog.message() || "";
      const context = applicationId
        ? `application:${applicationId}`
        : "browserSession";

      if (type === "alert") {
        await logJobEvent(
          "browserDialog",
          "ALERT_ACCEPTED",
          `[${context}] Browser alert observed: "${message}".`,
        );
        await dialog.accept().catch(() => {});
        return;
      }

      await logJobEvent(
        "browserDialog",
        "DIALOG_DISMISSED",
        `[${context}] Browser ${type} observed: "${message}".`,
      );
      await dialog.dismiss().catch(() => {});
    } catch {
      await dialog.dismiss().catch(() => {});
    }
  });
};

export default attachDialogHandler;
