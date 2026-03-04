const now = () => new Date().toISOString();

export const logger = {
  info(message, extra) {
    if (extra === undefined) {
      console.error(`[${now()}] INFO ${message}`);
      return;
    }
    console.error(`[${now()}] INFO ${message}`, extra);
  },

  error(message, extra) {
    if (extra === undefined) {
      console.error(`[${now()}] ERROR ${message}`);
      return;
    }
    console.error(`[${now()}] ERROR ${message}`, extra);
  }
};

