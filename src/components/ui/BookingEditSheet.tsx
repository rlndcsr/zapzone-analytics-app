import {
  Bell,
  Calendar as CalendarIcon,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Package as PackageIcon,
  Save,
  User,
  X,
} from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getToken } from "../../lib/session";
import {
  fetchPackages,
  fetchRooms,
  updateBooking,
  type BookingDetail,
  type PackageOption,
  type RoomOption,
} from "../../services/bookingsService";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const STATUS_OPTIONS = [
  { label: "Pending", value: "pending" },
  { label: "Confirmed", value: "confirmed" },
  { label: "Checked In", value: "checked-in" },
  { label: "Completed", value: "completed" },
  { label: "Cancelled", value: "cancelled" },
];
const GENDER_OPTIONS = [
  { label: "Male", value: "male" },
  { label: "Female", value: "female" },
  { label: "Other", value: "other" },
];

const pad2 = (n: number) => String(n).padStart(2, "0");

function to12h(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const meridian = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${pad2(m)} ${meridian}`;
}

// 15-minute slots across a typical operating window (11:15 AM – 8:00 PM).
const TIME_SLOTS = (() => {
  const out: string[] = [];
  for (let mins = 11 * 60 + 15; mins <= 20 * 60; mins += 15) {
    out.push(`${pad2(Math.floor(mins / 60))}:${pad2(mins % 60)}`);
  }
  return out;
})();

const FieldLabel = ({ children }: { children: React.ReactNode }) => (
  <Text className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-1.5">
    {children}
  </Text>
);

const SectionHeader = ({
  icon: Icon,
  title,
}: {
  icon: React.ComponentType<{ size?: number; color?: string }>;
  title: string;
}) => (
  <View className="flex-row items-center gap-2 mt-7 mb-3">
    <Icon size={18} color="#0644C7" />
    <Text className="text-base font-bold text-gray-900 dark:text-white">
      {title}
    </Text>
  </View>
);

const inputClass =
  "border border-gray-200 dark:border-neutral-700 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white bg-white dark:bg-neutral-900";

type Option = { label: string; value: string | number };

/** Tap-to-open option picker (used for package, space, status, gender). */
const SelectField = ({
  label,
  value,
  placeholder,
  options,
  onSelect,
}: {
  label: string;
  value: string | number | null;
  placeholder: string;
  options: Option[];
  onSelect: (v: string | number) => void;
}) => {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => String(o.value) === String(value));
  return (
    <View>
      <FieldLabel>{label}</FieldLabel>
      <Pressable
        onPress={() => setOpen(true)}
        className="flex-row items-center justify-between border border-gray-200 dark:border-neutral-700 rounded-xl px-4 py-3 bg-white dark:bg-neutral-900 active:opacity-80"
      >
        <Text
          className={`text-sm flex-1 mr-2 ${
            current ? "text-gray-900 dark:text-white" : "text-gray-400"
          }`}
          numberOfLines={1}
        >
          {current?.label ?? placeholder}
        </Text>
        <ChevronDown size={18} color="#9ca3af" />
      </Pressable>

      <Modal
        visible={open}
        transparent
        statusBarTranslucent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable
          className="flex-1 justify-end"
          style={{ backgroundColor: "rgba(20,20,20,0.5)" }}
          onPress={() => setOpen(false)}
        >
          <View className="bg-white dark:bg-neutral-900 rounded-t-3xl max-h-[70%] pb-6">
            <View className="w-10 h-1 rounded-full bg-gray-300 self-center mt-3 mb-1" />
            <Text className="text-base font-bold text-gray-900 dark:text-white px-5 pt-3 pb-2">
              {label}
            </Text>
            <ScrollView>
              {options.length === 0 ? (
                <Text className="text-sm text-gray-400 px-5 py-4">
                  No options available.
                </Text>
              ) : (
                options.map((o) => {
                  const active = String(o.value) === String(value);
                  return (
                    <Pressable
                      key={String(o.value)}
                      onPress={() => {
                        onSelect(o.value);
                        setOpen(false);
                      }}
                      className="px-5 py-3.5 flex-row items-center justify-between active:bg-gray-50 dark:active:bg-neutral-800"
                    >
                      <Text
                        className={`text-sm flex-1 mr-2 ${
                          active
                            ? "text-[#0644C7] font-semibold"
                            : "text-gray-700 dark:text-gray-200"
                        }`}
                      >
                        {o.label}
                      </Text>
                      {active && <Check size={18} color="#0644C7" />}
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
};

type Props = {
  visible: boolean;
  detail: BookingDetail | null;
  onClose: () => void;
  /** Called after a successful save so the parent can refetch. */
  onSaved: () => void;
};

/** Full-screen "Edit Booking" form, mirroring the web edit page. */
export function BookingEditSheet({ visible, detail, onClose, onSaved }: Props) {
  const insets = useSafeAreaInsets();

  const [packages, setPackages] = useState<PackageOption[]>([]);
  const [rooms, setRooms] = useState<RoomOption[]>([]);
  const [saving, setSaving] = useState(false);

  // Form state
  const [packageId, setPackageId] = useState<number | null>(null);
  const [roomId, setRoomId] = useState<number | null>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [date, setDate] = useState<string>("");
  const [time, setTime] = useState<string>("");
  const [participants, setParticipants] = useState("");
  const [status, setStatus] = useState("pending");
  const [gohName, setGohName] = useState("");
  const [gohAge, setGohAge] = useState("");
  const [gohGender, setGohGender] = useState<string | null>(null);
  const [customerNotes, setCustomerNotes] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [sendEmail, setSendEmail] = useState(false);
  const [anchor, setAnchor] = useState<Date>(new Date());

  // Seed the form whenever a booking is opened for editing.
  useEffect(() => {
  if (!visible || !detail) return;
  setPackageId(detail.packageId);
  setRoomId(detail.roomId);
  setFullName(detail.customerName ?? "");
  setEmail(detail.customerEmail ?? "");
  setPhone(detail.customerPhone ?? "");
  setDate(detail.date ?? "");
  setTime(detail.time ?? "");
  setParticipants(String(detail.participants ?? ""));
  setStatus(detail.status ?? "pending");
  setGohName(detail.guestOfHonorName ?? "");
  setGohAge(detail.guestOfHonorAge != null ? String(detail.guestOfHonorAge) : "");
  setGohGender(detail.guestOfHonorGender ?? null);
  setCustomerNotes(detail.customerNotes ?? "");
  setInternalNotes(detail.internalNotes ?? "");
  setSendEmail(false);
  setAnchor(detail.date ? new Date(`${detail.date}T00:00:00`) : new Date());
}, [visible, detail]); // ✅ only re-seed when a different booking is opened

  // Load selectable packages/spaces for the current location.
  useEffect(() => {
    if (!visible) return;
    const token = getToken();
    if (!token) return;
    let alive = true;
    const locId = detail?.locationId ?? undefined;
    fetchPackages(token, locId)
      .then((p) => alive && setPackages(p))
      .catch(() => {});
    fetchRooms(token, locId)
      .then((r) => alive && setRooms(r))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [visible, detail?.locationId]);

  // Ensure the current package/space appear as options even if the list fetch
  // failed or omitted them.
  const packageOptions: Option[] = useMemo(() => {
    const opts = packages.map((p) => ({
      label: p.price != null ? `${p.name} – $${p.price.toFixed(2)}` : p.name,
      value: p.id,
    }));
    if (detail?.packageId != null && !opts.some((o) => o.value === detail.packageId)) {
      opts.unshift({ label: detail.packageName, value: detail.packageId });
    }
    return opts;
  }, [packages, detail]);

  const roomOptions: Option[] = useMemo(() => {
    const opts = rooms.map((r) => ({ label: r.name, value: r.id }));
    if (detail?.roomId != null && !opts.some((o) => o.value === detail.roomId)) {
      opts.unshift({ label: detail.roomName ?? "Current space", value: detail.roomId });
    }
    return opts;
  }, [rooms, detail]);

  const cells = useMemo(() => {
    const y = anchor.getFullYear();
    const m = anchor.getMonth();
    const firstWeekday = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const out: { key: string | null; day: number }[] = [];
    for (let i = 0; i < firstWeekday; i++) out.push({ key: null, day: 0 });
    for (let d = 1; d <= daysInMonth; d++) {
      out.push({ key: `${y}-${pad2(m + 1)}-${pad2(d)}`, day: d });
    }
    while (out.length % 7 !== 0) out.push({ key: null, day: 0 });
    return out;
  }, [anchor]);

  const durationMins = useMemo(() => {
    if (!detail) return 0;
    return detail.durationUnit === "hours" ? detail.duration * 60 : detail.duration;
  }, [detail]);

  const endForSlot = (hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
    const end = h * 60 + m + durationMins;
    return to12h(`${pad2(Math.floor((end % 1440) / 60))}:${pad2(end % 60)}`);
  };

  const stepMonth = (dir: number) => {
    const next = new Date(anchor);
    next.setMonth(anchor.getMonth() + dir);
    setAnchor(next);
  };

  const handleSave = async () => {
    if (!detail || saving) return;
    const token = getToken();
    if (!token) {
      Alert.alert("Not authenticated");
      return;
    }
    setSaving(true);
    try {
      await updateBooking(token, detail.id, {
        packageId,
        roomId,
        customerName: fullName.trim(),
        customerEmail: email.trim(),
        customerPhone: phone.trim(),
        date,
        time,
        participants: Number(participants) || 0,
        status,
        guestOfHonorName: gohName.trim() || null,
        guestOfHonorAge: gohAge ? Number(gohAge) : null,
        guestOfHonorGender: gohGender,
        customerNotes: customerNotes.trim() || null,
        internalNotes: internalNotes.trim() || null,
        sendEmail,
      });
      onSaved();
      onClose();
    } catch (e) {
      Alert.alert(
        "Save failed",
        e instanceof Error ? e.message : "Could not update the booking.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {/* Full-screen opaque surface. Using a transparent Modal (like every other
          modal in the app) avoids the Android New-Architecture crash caused by
          opaque full-screen Modals. */}
      <View className="flex-1 bg-gray-50 dark:bg-black">
        {/* Header */}
        <View
          className="bg-white dark:bg-neutral-900 px-5 pb-4 border-b border-gray-100 dark:border-neutral-800"
          style={{ paddingTop: insets.top + 12 }}
        >
          <View className="flex-row items-center gap-3">
            <Pressable
              onPress={onClose}
              className="w-9 h-9 rounded-full bg-gray-100 dark:bg-neutral-800 items-center justify-center active:opacity-80"
            >
              <ChevronLeft size={20} color="#111827" />
            </Pressable>
            <View className="flex-1">
              <Text className="text-xl font-bold text-gray-900 dark:text-white">
                Edit Booking
              </Text>
              {!!detail?.referenceNumber && (
                <Text className="text-xs text-gray-400 dark:text-gray-500">
                  Reference: {detail.referenceNumber}
                </Text>
              )}
            </View>
            <Pressable onPress={onClose} className="p-1">
              <X size={22} color="#9ca3af" />
            </Pressable>
          </View>
        </View>

        <ScrollView
          className="flex-1 px-5"
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 24 }}
        >
          {/* Package / Party */}
          <SectionHeader icon={PackageIcon} title="Package / Party" />
          <SelectField
            label="Package"
            value={packageId}
            placeholder="Select a package"
            options={packageOptions}
            onSelect={(v) => setPackageId(Number(v))}
          />

          {/* Space Assignment */}
          <SectionHeader icon={CalendarIcon} title="Space Assignment" />
          <SelectField
            label="Space"
            value={roomId}
            placeholder="Select a space"
            options={roomOptions}
            onSelect={(v) => setRoomId(Number(v))}
          />

          {/* Customer Information */}
          <SectionHeader icon={User} title="Customer Information" />
          <FieldLabel>Full Name</FieldLabel>
          <TextInput
            value={fullName}
            onChangeText={setFullName}
            placeholder="Full name"
            placeholderTextColor="#9ca3af"
            className={inputClass}
          />
          <View className="flex-row gap-3 mt-3">
            <View className="flex-1">
              <FieldLabel>Email</FieldLabel>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="Email"
                placeholderTextColor="#9ca3af"
                keyboardType="email-address"
                autoCapitalize="none"
                className={inputClass}
              />
            </View>
            <View className="flex-1">
              <FieldLabel>Phone</FieldLabel>
              <TextInput
                value={phone}
                onChangeText={setPhone}
                placeholder="Phone"
                placeholderTextColor="#9ca3af"
                keyboardType="phone-pad"
                className={inputClass}
              />
            </View>
          </View>

          {/* Booking Details: date */}
          <SectionHeader icon={CalendarIcon} title="Booking Details" />
          <FieldLabel>Date</FieldLabel>
          <View className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-100 dark:border-neutral-800 p-3">
            <View className="flex-row items-center justify-between mb-2">
              <Pressable
                onPress={() => stepMonth(-1)}
                className="w-8 h-8 rounded-full items-center justify-center active:opacity-70"
              >
                <ChevronLeft size={18} color="#6b7280" />
              </Pressable>
              <Text className="text-sm font-bold text-gray-900 dark:text-white">
                {MONTH_NAMES[anchor.getMonth()]} {anchor.getFullYear()}
              </Text>
              <Pressable
                onPress={() => stepMonth(1)}
                className="w-8 h-8 rounded-full items-center justify-center active:opacity-70"
              >
                <ChevronRight size={18} color="#6b7280" />
              </Pressable>
            </View>
            <View className="flex-row">
              {WEEKDAYS.map((d) => (
                <View key={d} className="flex-1 items-center py-1">
                  <Text className="text-[10px] font-semibold text-gray-400 uppercase">
                    {d}
                  </Text>
                </View>
              ))}
            </View>
            {Array.from({ length: cells.length / 7 }).map((_, row) => (
              <View key={row} className="flex-row">
                {cells.slice(row * 7, row * 7 + 7).map((cell, col) => {
                  const selected = cell.key && cell.key === date;
                  return (
                    <Pressable
                      key={cell.key ?? `pad-${row}-${col}`}
                      disabled={cell.key === null}
                      onPress={() => cell.key && setDate(cell.key)}
                      className="flex-1 items-center py-1.5"
                    >
                      <View
                        className={`w-9 h-9 rounded-xl items-center justify-center ${
                          selected ? "bg-[#0644C7]" : ""
                        }`}
                      >
                        {cell.key !== null && (
                          <Text
                            className={`text-sm ${
                              selected
                                ? "text-white font-bold"
                                : "text-gray-700 dark:text-gray-200"
                            }`}
                          >
                            {cell.day}
                          </Text>
                        )}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>

          {/* Booking Details: time */}
          <View className="mt-4">
            <FieldLabel>Time</FieldLabel>
          </View>
          <View className="flex-row flex-wrap -mx-1">
            {TIME_SLOTS.map((slot) => {
              const active = slot === time;
              return (
                <View key={slot} className="w-1/3 px-1 mb-2">
                  <Pressable
                    onPress={() => setTime(slot)}
                    className={`rounded-xl border px-2 py-2 ${
                      active
                        ? "border-[#0644C7] bg-[#0644C7]/10"
                        : "border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900"
                    }`}
                  >
                    <Text
                      className={`text-xs font-semibold ${
                        active ? "text-[#0644C7]" : "text-gray-800 dark:text-gray-200"
                      }`}
                    >
                      {to12h(slot)}
                    </Text>
                    <Text className="text-[10px] text-gray-400">
                      {endForSlot(slot)}
                    </Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
          {!!time && (
            <Text className="text-xs text-gray-400 mt-1">
              Selected: {to12h(time)}
            </Text>
          )}

          {/* Participants + Status */}
          <View className="flex-row gap-3 mt-4">
            <View className="flex-1">
              <FieldLabel>Participants</FieldLabel>
              <TextInput
                value={participants}
                onChangeText={setParticipants}
                placeholder="0"
                placeholderTextColor="#9ca3af"
                keyboardType="number-pad"
                className={inputClass}
              />
            </View>
            <View className="flex-1">
              <SelectField
                label="Status"
                value={status}
                placeholder="Select status"
                options={STATUS_OPTIONS}
                onSelect={(v) => setStatus(String(v))}
              />
            </View>
          </View>

          {/* Guest of Honor */}
          <SectionHeader icon={User} title="Guest of Honor" />
          <FieldLabel>Name</FieldLabel>
          <TextInput
            value={gohName}
            onChangeText={setGohName}
            placeholder="Guest of honor name"
            placeholderTextColor="#9ca3af"
            className={inputClass}
          />
          <View className="flex-row gap-3 mt-3">
            <View className="flex-1">
              <FieldLabel>Age</FieldLabel>
              <TextInput
                value={gohAge}
                onChangeText={setGohAge}
                placeholder="Age"
                placeholderTextColor="#9ca3af"
                keyboardType="number-pad"
                className={inputClass}
              />
            </View>
            <View className="flex-1">
              <SelectField
                label="Gender"
                value={gohGender}
                placeholder="Select"
                options={GENDER_OPTIONS}
                onSelect={(v) => setGohGender(String(v))}
              />
            </View>
          </View>

          {/* Customer Notes */}
          <SectionHeader icon={User} title="Customer Notes" />
          <TextInput
            value={customerNotes}
            onChangeText={setCustomerNotes}
            placeholder="Special requests or notes from the customer…"
            placeholderTextColor="#9ca3af"
            multiline
            textAlignVertical="top"
            className={`${inputClass} min-h-[80px]`}
          />

          {/* Internal Staff Notes */}
          <View className="flex-row items-center gap-2 mt-7 mb-3">
            <Text className="text-base font-bold text-gray-900 dark:text-white">
              Internal Staff Notes
            </Text>
            <View className="px-2 py-0.5 rounded-full bg-amber-100">
              <Text className="text-[10px] font-semibold text-amber-700">
                Staff Only
              </Text>
            </View>
          </View>
          <View className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900/30 rounded-2xl p-3">
            <Text className="text-xs text-gray-500 dark:text-gray-400 mb-2">
              Private notes visible only to staff. Never shown to customers.
            </Text>
            <TextInput
              value={internalNotes}
              onChangeText={setInternalNotes}
              placeholder="e.g., VIP customer, dietary restrictions, special arrangements…"
              placeholderTextColor="#9ca3af"
              multiline
              textAlignVertical="top"
              className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 rounded-xl p-3 text-sm text-gray-900 dark:text-white min-h-[80px]"
            />
          </View>

          {/* Email Notification */}
          <SectionHeader icon={Bell} title="Email Notification" />
          <View className="flex-row items-center justify-between bg-white dark:bg-neutral-900 border border-gray-100 dark:border-neutral-800 rounded-2xl px-4 py-3">
            <View className="flex-row items-center gap-2 flex-1 mr-2">
              <Bell size={16} color="#16a34a" />
              <Text className="text-sm text-gray-700 dark:text-gray-200">
                Customer will receive update
              </Text>
            </View>
            <View className="flex-row rounded-full border border-gray-200 dark:border-neutral-700 overflow-hidden">
              <Pressable
                onPress={() => setSendEmail(false)}
                className={`px-3 py-1.5 ${!sendEmail ? "bg-gray-100 dark:bg-neutral-800" : ""}`}
              >
                <Text
                  className={`text-xs font-semibold ${
                    !sendEmail ? "text-gray-900 dark:text-white" : "text-gray-400"
                  }`}
                >
                  Don&apos;t Send
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setSendEmail(true)}
                className={`px-3 py-1.5 ${sendEmail ? "bg-green-600" : ""}`}
              >
                <Text
                  className={`text-xs font-semibold ${
                    sendEmail ? "text-white" : "text-gray-400"
                  }`}
                >
                  Send Email
                </Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>

        {/* Footer */}
        <View
          className="flex-row gap-3 px-5 pt-3 bg-white dark:bg-neutral-900 border-t border-gray-100 dark:border-neutral-800"
          style={{ paddingBottom: insets.bottom + 12 }}
        >
          <Pressable
            onPress={onClose}
            disabled={saving}
            className="flex-1 py-3 rounded-xl border border-gray-300 dark:border-neutral-600 items-center active:opacity-80"
          >
            <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
              Cancel
            </Text>
          </Pressable>
          <Pressable
            onPress={handleSave}
            disabled={saving}
            className="flex-1 py-3 rounded-xl bg-[#0644C7] items-center flex-row justify-center gap-2 active:opacity-80"
          >
            {saving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Save size={16} color="#fff" />
                <Text className="text-sm font-semibold text-white">
                  Save Changes
                </Text>
              </>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
