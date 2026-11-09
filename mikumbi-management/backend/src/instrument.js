// instrument.js — Sentry (error monitoring) setup.
//
// This file MUST be the very first thing required in index.js, before any
// other module (express, pg, etc.) — Sentry can only auto-instrument things
// it's aware of before they're loaded into memory.
//
// If SENTRY_DSN is not set (e.g. running locally without one configured),
// Sentry quietly does nothing — `enabled: false` below — so this file is
// always safe to leave in place, in every environment.
require("dotenv").config();

const Sentry = require("@sentry/node");

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || "development",

  // Only a fraction of normal request traces (performance data, not errors)
  // are sent — errors are ALWAYS sent regardless of this setting. Kept low
  // to stay comfortably within Sentry's free-tier monthly quota as the
  // school's usage grows.
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 0,

  enabled: Boolean(process.env.SENTRY_DSN),
});

module.exports = Sentry;
