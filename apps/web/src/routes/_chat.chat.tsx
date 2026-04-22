import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

function BasicChatRouteLayout() {
  return <Outlet />;
}

export const Route = createFileRoute("/_chat/chat")({
  beforeLoad: async ({ context }) => {
    if (context.authGateState.status !== "authenticated") {
      throw redirect({ to: "/pair", replace: true });
    }
  },
  component: BasicChatRouteLayout,
});
