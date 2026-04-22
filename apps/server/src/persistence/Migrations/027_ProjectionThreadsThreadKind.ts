import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    ALTER TABLE projection_threads
    ADD COLUMN thread_kind TEXT NOT NULL DEFAULT 'agent'
  `.pipe(Effect.catch(() => Effect.void));

  yield* sql`
    UPDATE projection_threads
    SET thread_kind = COALESCE((
      SELECT CASE
        WHEN json_extract(events.payload_json, '$.threadKind') IN ('agent', 'chat')
          THEN json_extract(events.payload_json, '$.threadKind')
        ELSE 'agent'
      END
      FROM orchestration_events AS events
      WHERE events.event_type = 'thread.created'
        AND events.aggregate_kind = 'thread'
        AND events.stream_id = projection_threads.thread_id
      ORDER BY events.sequence DESC
      LIMIT 1
    ), 'agent')
  `;

  yield* sql`
    UPDATE projection_threads
    SET thread_kind = 'agent'
    WHERE thread_kind NOT IN ('agent', 'chat')
  `;
});
