const socketUtil = require('../utils/socket');

module.exports = {
  initSockets: (io) => {
    socketUtil.init(io);
  },
  getIO: () => socketUtil.getIO()
};
