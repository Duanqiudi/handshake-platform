import "@testing-library/jest-dom/vitest";
import { beforeEach } from "vitest";

beforeEach(() => {
  window.localStorage.clear();
  window.location.hash = "#/";
});
