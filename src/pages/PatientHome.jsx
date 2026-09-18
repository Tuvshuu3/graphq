import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Header, PatientMedicineRow } from "../components";
import { HomeIcon } from "../assets";
import {
  getActiveCourse,
  getNextDoseTime,
  isMedicineActive,
} from "../components/PatientMedicineRow";
import { createDoseLog, getPatient } from "../api";
import "../styles/PatientHome.css";

const missed_dose_interval = 30 * 1000;

const LogoutIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24">
    <path d="M10 17l5-5-5-5" />
    <path d="M15 12H3" />
    <path d="M21 19V5a2 2 0 0 0-2-2h-6" />
  </svg>
);

const getLatestCourseDoseLog = (doseLogs = [], courseId) =>
  [...doseLogs]
    .filter((doseLog) => doseLog.courseId === courseId)
    .sort(
      (firstLog, secondLog) =>
        new Date(secondLog.time) - new Date(firstLog.time),
    )[0];

const isSameDay = (firstDate, secondDate) =>
  firstDate.getFullYear() === secondDate.getFullYear() &&
  firstDate.getMonth() === secondDate.getMonth() &&
  firstDate.getDate() === secondDate.getDate();

const PatientHome = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedPatientId = searchParams.get("patientId");
  const [medicineData, setMedicineData] = useState([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [activeAlert, setActiveAlert] = useState(null);
  const [missedDoses, setMissedDoses] = useState([]);
  const [handledAlerts, setHandledAlerts] = useState([]);
  const [medicineSearch, setMedicineSearch] = useState("");
  const [medicineFilter, setMedicineFilter] = useState("all");
  const pendingMissedDoseKeys = useRef(new Set());
  const patientData =
    medicineData.find((patient) => patient._id === requestedPatientId) ||
    medicineData[0];
  const patientName = patientData?.name;
  const patientId = patientData?._id;
  const filteredMedicines =
    patientData?.medicines?.filter((medicine) => {
      const matchesSearch = medicine.name
        .toLowerCase()
        .includes(medicineSearch.trim().toLowerCase());

      if (!matchesSearch) {
        return false;
      }

      const medicineIsActive = isMedicineActive(medicine, currentTime);

      if (medicineFilter === "all") {
        return true;
      }

      if (medicineFilter === "active") {
        return medicineIsActive;
      }

      if (medicineFilter === "inactive") {
        return !medicineIsActive;
      }

      const activeCourse = getActiveCourse(medicine, currentTime);

      if (!activeCourse) {
        return false;
      }

      const nextDoseTime = getNextDoseTime(
        {
          ...medicine,
          doseLogs: medicine.doseLogs.filter(
            (doseLog) => doseLog.courseId === activeCourse.courseId,
          ),
        },
        currentTime,
      );

      return !nextDoseTime || isSameDay(nextDoseTime, currentTime);
    }) || [];
  const sortedMedicines = [...filteredMedicines].sort(
    (firstMedicine, secondMedicine) =>
      Number(isMedicineActive(secondMedicine, currentTime)) -
      Number(isMedicineActive(firstMedicine, currentTime)),
  );

  useEffect(() => {
    async function loadPatient() {
      if (!requestedPatientId) {
        return;
      }

      try {
        const patient = await getPatient(requestedPatientId);
        setMedicineData([patient]);
      } catch (error) {
        console.error(error);
      }
    }

    loadPatient();
  }, [requestedPatientId]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!patientData || activeAlert) {
      return;
    }

    const previousTime = new Date(currentTime.getTime() - 1000);
    const dueMedicine = patientData.medicines
      .map((medicine) => {
        if (!isMedicineActive(medicine, currentTime)) {
          return null;
        }

        const activeCourse = getActiveCourse(medicine, currentTime);
        const latestDoseLog = activeCourse
          ? getLatestCourseDoseLog(medicine.doseLogs, activeCourse.courseId)
          : null;

        if (latestDoseLog?.status === "missed") {
          return null;
        }

        const dueTime = getNextDoseTime(
          {
            ...medicine,
            doseLogs: activeCourse
              ? medicine.doseLogs.filter(
                  (doseLog) => doseLog.courseId === activeCourse.courseId,
                )
              : medicine.doseLogs,
          },
          previousTime,
        );

        if (!dueTime || !activeCourse) {
          return null;
        }

        const alertKey = `${medicine.id}-${dueTime.toISOString()}`;
        const crossedDueTime = dueTime > previousTime && dueTime <= currentTime;

        if (!crossedDueTime || handledAlerts.includes(alertKey)) {
          return null;
        }

        return {
          key: alertKey,
          medicineId: medicine.id,
          medicineName: medicine.name,
          courseId: activeCourse.courseId,
          dueTime,
          deadline: new Date(dueTime.getTime() + missed_dose_interval),
        };
      })
      .find(Boolean);

    if (dueMedicine) {
      setActiveAlert(dueMedicine);
      setHandledAlerts((currentAlerts) => [...currentAlerts, dueMedicine.key]);
    }
  }, [activeAlert, currentTime, handledAlerts, patientData]);

  useEffect(() => {
    if (!patientData) {
      return;
    }

    const unresolvedMissedDoses = patientData.medicines
      .map((medicine) => {
        const activeCourse = getActiveCourse(medicine, currentTime);
        const latestDoseLog = activeCourse
          ? getLatestCourseDoseLog(medicine.doseLogs, activeCourse.courseId)
          : null;

        if (latestDoseLog?.status !== "missed" || !activeCourse) {
          return null;
        }

        return {
          key: `${medicine.id}-${latestDoseLog.time}`,
          medicineId: medicine.id,
          medicineName: medicine.name,
          courseId: latestDoseLog.courseId,
          dueTime: new Date(latestDoseLog.time),
        };
      })
      .filter(Boolean);

    if (unresolvedMissedDoses.length > 0) {
      setMissedDoses((currentMissedDoses) => {
        const newMissedDoses = unresolvedMissedDoses.filter(
          (missedDose) =>
            !currentMissedDoses.some(
              (currentMissedDose) => currentMissedDose.key === missedDose.key,
            ),
        );

        if (newMissedDoses.length === 0) {
          return currentMissedDoses;
        }

        return [...currentMissedDoses, ...newMissedDoses];
      });
    }
  }, [currentTime, patientData]);

  const addDoseLog = useCallback(
    async (medicineId, doseLog) => {
      if (!patientId) {
        return;
      }

      let savedDoseLog;

      try {
        savedDoseLog = await createDoseLog(patientId, medicineId, doseLog);
      } catch (error) {
        console.error(error);
        return null;
      }

      setMedicineData((currentMedicineData) =>
        currentMedicineData.map((patientMedicineData) => {
          if (patientMedicineData.name !== patientName) {
            return patientMedicineData;
          }

          return {
            ...patientMedicineData,
            medicines: patientMedicineData.medicines.map((medicine) => {
              if (medicine.id !== medicineId) {
                return medicine;
              }

              return {
                ...medicine,
                doseLogs: [...medicine.doseLogs, savedDoseLog],
              };
            }),
          };
        }),
      );

      return savedDoseLog;
    },
    [patientId, patientName],
  );

  useEffect(() => {
    if (!patientData || activeAlert) {
      return;
    }

    const overdueDose = patientData.medicines
      .map((medicine) => {
        if (!isMedicineActive(medicine, currentTime)) {
          return null;
        }

        const activeCourse = getActiveCourse(medicine, currentTime);

        if (!activeCourse) {
          return null;
        }

        const latestDoseLog = getLatestCourseDoseLog(
          medicine.doseLogs,
          activeCourse.courseId,
        );

        if (!latestDoseLog || latestDoseLog.status === "missed") {
          return null;
        }

        const dueTime = new Date(
          new Date(latestDoseLog.time).getTime() +
            medicine.intervalHours * 60 * 60 * 1000,
        );
        const deadline = new Date(dueTime.getTime() + missed_dose_interval);

        if (currentTime < deadline) {
          return null;
        }

        return {
          key: `${medicine.id}-${dueTime.toISOString()}`,
          medicineId: medicine.id,
          medicineName: medicine.name,
          courseId: activeCourse.courseId,
          dueTime,
          deadline,
        };
      })
      .find(Boolean);

    if (!overdueDose || pendingMissedDoseKeys.current.has(overdueDose.key)) {
      return;
    }

    pendingMissedDoseKeys.current.add(overdueDose.key);

    async function logOverdueMissedDose() {
      const savedDoseLog = await addDoseLog(overdueDose.medicineId, {
        courseId: overdueDose.courseId,
        time: overdueDose.dueTime.toISOString(),
        status: "missed",
      });

      if (savedDoseLog) {
        setMissedDoses((currentMissedDoses) => {
          if (
            currentMissedDoses.some(
              (currentMissedDose) => currentMissedDose.key === overdueDose.key,
            )
          ) {
            return currentMissedDoses;
          }

          return [...currentMissedDoses, overdueDose];
        });
      }

      pendingMissedDoseKeys.current.delete(overdueDose.key);
    }

    logOverdueMissedDose();
  }, [activeAlert, addDoseLog, currentTime, patientData]);

  const handleTaken = async () => {
    if (!activeAlert || currentTime > activeAlert.deadline) {
      return;
    }

    await addDoseLog(activeAlert.medicineId, {
      courseId: activeAlert.courseId,
      time: currentTime.toISOString(),
      status: "taken",
    });
    setActiveAlert(null);
  };

  const handleTookMissedDose = async (missedDose) => {
    if (!missedDose) {
      return;
    }

    await addDoseLog(missedDose.medicineId, {
      courseId: missedDose.courseId,
      time: currentTime.toISOString(),
      status: "taken",
    });
    setMissedDoses((currentMissedDoses) =>
      currentMissedDoses.filter(
        (currentMissedDose) => currentMissedDose.key !== missedDose.key,
      ),
    );
  };

  useEffect(() => {
    if (!activeAlert || currentTime < activeAlert.deadline) {
      return;
    }

    async function logMissedDose() {
      const missedAlert = activeAlert;
      setActiveAlert(null);
      await addDoseLog(missedAlert.medicineId, {
        courseId: missedAlert.courseId,
        time: missedAlert.dueTime.toISOString(),
        status: "missed",
      });
      setMissedDoses((currentMissedDoses) => {
        if (
          currentMissedDoses.some(
            (currentMissedDose) => currentMissedDose.key === missedAlert.key,
          )
        ) {
          return currentMissedDoses;
        }

        return [...currentMissedDoses, missedAlert];
      });
    }

    logMissedDose();
  }, [activeAlert, addDoseLog, currentTime]);

  return (
    <div className="patient-home">
      <Header />

      <main className="patient-home-main">
        {missedDoses.map((missedDose) => (
          <div className="missed-dose-banner" key={missedDose.key}>
            <span>{missedDose.medicineName} was missed.</span>
            <span> </span>
            <button
              type="button"
              onClick={() => handleTookMissedDose(missedDose)}
            >
              Took it
            </button>
          </div>
        ))}

        <div className="patient-home-title">
          <h1>{patientData?.name || "Patient"}'s medicines</h1>
          <input
            className="patient-medicine-search"
            type="search"
            value={medicineSearch}
            onChange={(event) => setMedicineSearch(event.target.value)}
            placeholder="Search medicines"
          />
          <div
            className="patient-medicine-filters"
            aria-label="Medicine filters"
          >
            <button
              className={medicineFilter === "all" ? "active" : ""}
              type="button"
              onClick={() => setMedicineFilter("all")}
            >
              All
            </button>
            <button
              className={medicineFilter === "today" ? "active" : ""}
              type="button"
              onClick={() => setMedicineFilter("today")}
            >
              Today's medicines
            </button>
            <button
              className={medicineFilter === "active" ? "active" : ""}
              type="button"
              onClick={() => setMedicineFilter("active")}
            >
              Active
            </button>
            <button
              className={medicineFilter === "inactive" ? "active" : ""}
              type="button"
              onClick={() => setMedicineFilter("inactive")}
            >
              Non active
            </button>
          </div>
        </div>

        <div className="patient-medicine-list">
          {sortedMedicines.length > 0 ? (
            sortedMedicines.map((medicine) => (
              <PatientMedicineRow
                key={medicine.id}
                medicine={medicine}
                currentTime={currentTime}
              />
            ))
          ) : (
            <div className="patient-empty-state">
              {patientData?.medicines?.length > 0
                ? "No matching medicines"
                : "No medicines"}
            </div>
          )}
        </div>
      </main>

      {activeAlert && (
        <div className="dose-alert-backdrop">
          <div className="dose-alert">
            <h2>Take Your {activeAlert.medicineName}</h2>
            <p></p>
            <button type="button" onClick={handleTaken}>
              Taken
            </button>
          </div>
        </div>
      )}

      <footer className="patient-mobile-menu" aria-label="Patient menu">
        <button className="active" type="button" aria-current="page">
          <HomeIcon />
          <span>Home</span>
        </button>
        <button type="button" onClick={() => navigate("/")} aria-label="Logout">
          <LogoutIcon />
          <span>Logout</span>
        </button>
      </footer>
    </div>
  );
};

export default PatientHome;
