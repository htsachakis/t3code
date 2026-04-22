import { createFileRoute } from "@tanstack/react-router";

import { NoActiveThreadState } from "../components/NoActiveThreadState";

function BasicChatIndexRouteView() {
  return <NoActiveThreadState />;
}

export const Route = createFileRoute("/_chat/chat/")({
  component: BasicChatIndexRouteView,
});
