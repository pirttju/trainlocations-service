module.exports = {
  apps : [{
    name: "trainlocations-service",
    script: "index.js",
    restart_delay: 3000,
    watch: false,
    env: {
      "NODE_ENV": "production"
    },
    env_dev: {
      "NODE_ENV": "development"
    }
  }]
};