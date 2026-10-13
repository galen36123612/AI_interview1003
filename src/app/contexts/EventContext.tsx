"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useState,
  FC,
  PropsWithChildren,
} from "react";
import { v4 as uuidv4 } from "uuid";
import { LoggedEvent } from "@/app/types";

type EventContextValue = {
  loggedEvents: LoggedEvent[];
  logClientEvent: (eventObj: Record<string, any>, eventNameSuffix?: string) => void;
  logServerEvent: (eventObj: Record<string, any>, eventNameSuffix?: string) => void;
  toggleExpand: (id: number | string) => void;
};

const EventContext = createContext<EventContextValue | undefined>(undefined);

export const EventProvider: FC<PropsWithChildren> = ({ children }) => {
  const [loggedEvents, setLoggedEvents] = useState<LoggedEvent[]>([]);

  const addLoggedEvent = useCallback(
    (
      direction: "client" | "server",
      eventName: string,
      eventData: Record<string, any>
    ) => {
      const id = eventData.event_id || uuidv4();
      setLoggedEvents((prev) =>
        [
          ...prev,
          {
            id,
            direction,
            eventName,
            eventData,
            timestamp: new Date().toLocaleTimeString(),
            expanded: false,
          },
        ].slice(-500)
      );
    },
    []
  );

  const logClientEvent: EventContextValue["logClientEvent"] = useCallback(
    (eventObj, eventNameSuffix = "") => {
      const name = `${eventObj.type || ""} ${eventNameSuffix || ""}`.trim();
      addLoggedEvent("client", name, eventObj);
    },
    [addLoggedEvent]
  );

  const logServerEvent: EventContextValue["logServerEvent"] = useCallback(
    (eventObj, eventNameSuffix = "") => {
      const name = `${eventObj.type || ""} ${eventNameSuffix || ""}`.trim();
      addLoggedEvent("server", name, eventObj);
    },
    [addLoggedEvent]
  );

  const toggleExpand: EventContextValue["toggleExpand"] = useCallback((id) => {
    setLoggedEvents((prev) =>
      prev.map((log) => {
        if (log.id === id) {
          return { ...log, expanded: !log.expanded };
        }
        return log;
      })
    );
  }, []);

  return (
    <EventContext.Provider
      value={{ loggedEvents, logClientEvent, logServerEvent, toggleExpand }}
    >
      {children}
    </EventContext.Provider>
  );
};

export function useEvent() {
  const context = useContext(EventContext);
  if (!context) {
    throw new Error("useEvent must be used within an EventProvider");
  }
  return context;
}
