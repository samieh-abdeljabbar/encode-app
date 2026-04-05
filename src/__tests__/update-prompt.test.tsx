import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { UpdatePrompt } from "../components/layout/UpdatePrompt";
import { useUpdaterStore } from "../lib/updater";

const initialState = useUpdaterStore.getState();

describe("UpdatePrompt", () => {
  beforeEach(() => {
    useUpdaterStore.setState({
      ...initialState,
      status: "idle",
      version: null,
      notes: null,
      error: null,
      downloadedBytes: 0,
      contentLength: null,
      dismissed: false,
    });
  });

  afterEach(() => {
    useUpdaterStore.setState(initialState);
  });

  it("renders nothing when status is idle", () => {
    const { container } = render(<UpdatePrompt />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when status is checking", () => {
    useUpdaterStore.setState({ status: "checking" });
    const { container } = render(<UpdatePrompt />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows version and install button when update available", () => {
    useUpdaterStore.setState({
      status: "available",
      version: "2.0.0-alpha.7",
    });
    render(<UpdatePrompt />);
    expect(screen.getByText(/update available/i)).toBeInTheDocument();
    expect(screen.getByText(/Encode 2.0.0-alpha.7/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /install update/i }),
    ).toBeInTheDocument();
  });

  it("hides prompt when Later is clicked", () => {
    useUpdaterStore.setState({
      status: "available",
      version: "2.0.0-alpha.7",
    });
    const { rerender, container } = render(<UpdatePrompt />);
    useUpdaterStore.getState().dismiss();
    rerender(<UpdatePrompt />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows progress bar during download", () => {
    useUpdaterStore.setState({
      status: "downloading",
      version: "2.0.0-alpha.7",
      downloadedBytes: 500,
      contentLength: 1000,
    });
    render(<UpdatePrompt />);
    expect(screen.getByText(/downloading/i)).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
  });

  it("shows restart button when ready", () => {
    useUpdaterStore.setState({
      status: "ready",
      version: "2.0.0-alpha.7",
    });
    render(<UpdatePrompt />);
    expect(screen.getByText(/ready to install/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /restart now/i }),
    ).toBeInTheDocument();
  });

  it("shows error message on error", () => {
    useUpdaterStore.setState({
      status: "error",
      error: "Network request failed",
    });
    render(<UpdatePrompt />);
    expect(screen.getByText(/update failed/i)).toBeInTheDocument();
    expect(screen.getByText("Network request failed")).toBeInTheDocument();
  });
});
