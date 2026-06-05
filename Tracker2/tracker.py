import tkinter as tk
from tkinter import ttk, messagebox, simpledialog
import json
import os

DATA_FILE = "units.json"
TOTAL_ROOMS = 755
PREFIX = "42/"

def load_units():
    if os.path.exists(DATA_FILE):
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            try:
                return set(json.load(f))
            except json.JSONDecodeError:
                return set()
    return set()

def save_units(units):
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(list(units), f, ensure_ascii=False, indent=4)

class UnitTrackerApp(tk.Tk):
    def __init__(self):
        super().__init__()

        self.title("ระบบบันทึกคีย์ห้องชุด")
        self.geometry("500x750")
        self.configure(padx=20, pady=20)

        # Set a clear modern font theme
        self.option_add('*Font', 'Helvetica 11')

        self.units = load_units()
        self.current_display_list = []

        self.create_widgets()
        self.update_ui()

        # Bind Enter key to add unit
        self.bind('<Return>', lambda event: self.add_unit())

    def create_widgets(self):
        # Header
        self.header_label = ttk.Label(self, text="ระบบบันทึกและตรวจสอบห้องชุด", font=("Helvetica", 16, "bold"))
        self.header_label.pack(pady=(0, 5))

        self.progress_label = ttk.Label(self, text="", font=("Helvetica", 12))
        self.progress_label.pack(pady=(0, 15))

        # Progress Bar
        self.progress_bar = ttk.Progressbar(self, orient=tk.HORIZONTAL, length=400, mode='determinate', maximum=TOTAL_ROOMS)
        self.progress_bar.pack(fill=tk.X, pady=(0, 20))

        # Input Frame
        input_frame = ttk.Frame(self)
        input_frame.pack(fill=tk.X, pady=5)

        ttk.Label(input_frame, text=f"หมายเลขห้อง (แค่พิมพ์เลขแล้วกด Enter รัวๆ ได้เลย!):", font=("Helvetica", 10)).pack(anchor=tk.W)

        entry_frame = ttk.Frame(input_frame)
        entry_frame.pack(fill=tk.X, pady=5)

        ttk.Label(entry_frame, text=PREFIX, font=("Helvetica", 14, "bold")).pack(side=tk.LEFT)

        self.entry_var = tk.StringVar()
        self.entry = ttk.Entry(entry_frame, textvariable=self.entry_var, font=("Helvetica", 14))
        self.entry.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=(5, 10))
        self.entry.focus()

        self.add_btn = tk.Button(entry_frame, text="บันทึก (Enter)", font=("Helvetica", 11, "bold"),
                                 bg="#4CAF50", fg="white", padx=10, command=self.add_unit)
        self.add_btn.pack(side=tk.RIGHT)

        # Status Message
        self.status_var = tk.StringVar()
        self.status_label = ttk.Label(self, textvariable=self.status_var, font=("Helvetica", 12, "bold"))
        self.status_label.pack(pady=10)

        # List Frame
        list_frame = ttk.Frame(self)
        list_frame.pack(fill=tk.BOTH, expand=True, pady=5)

        ttk.Label(list_frame, text="รายการห้องทั้งหมด (42/001 - 42/755):", font=("Helvetica", 10)).pack(anchor=tk.W, pady=(0, 5))

        # Scrollbar and Listbox
        scrollbar = ttk.Scrollbar(list_frame)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)

        self.listbox = tk.Listbox(list_frame, yscrollcommand=scrollbar.set, font=("Helvetica", 12), selectbackground="#b3d9ff")
        self.listbox.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        scrollbar.config(command=self.listbox.yview)

        # Action Buttons Frame
        action_frame = ttk.Frame(self)
        action_frame.pack(fill=tk.X, pady=(15, 0))

        self.edit_btn = tk.Button(action_frame, text="✏️ แก้ไขรายการ", font=("Helvetica", 10, "bold"),
                                  bg="#FFC107", fg="black", pady=5, command=self.edit_selected)
        self.edit_btn.pack(side=tk.LEFT, expand=True, fill=tk.X, padx=(0, 5))

        self.delete_btn = tk.Button(action_frame, text="🗑️ ยกเลิกการคีย์", font=("Helvetica", 10, "bold"),
                                    bg="#F44336", fg="white", pady=5, command=self.delete_selected)
        self.delete_btn.pack(side=tk.RIGHT, expand=True, fill=tk.X, padx=(5, 0))

    def sort_key(self, unit_str):
        # พยายามดึงตัวเลขด้านหลัง / มาใช้เรียงลำดับ เช่น 42/001 -> 1
        try:
            num_part = unit_str.split('/')[-1]
            return int(num_part)
        except ValueError:
            return unit_str

    def update_ui(self):
        # Update progress text and bar
        count = len(self.units)
        self.progress_label.config(text=f"บันทึกแล้ว: {count} / {TOTAL_ROOMS} ห้อง")
        self.progress_bar['value'] = count

        # ล้าง Listbox เก่า
        self.listbox.delete(0, tk.END)

        # สร้างรายชื่อตั้งต้น 42/001 ถึง 42/755
        master_list = set(f"{PREFIX}{i:03d}" for i in range(1, TOTAL_ROOMS + 1))

        # รวมกับห้องที่มีอยู่ใน units (เผื่อมีการคีย์เลขแปลกๆ เข้ามา)
        all_units = master_list.union(self.units)

        # เรียงลำดับทั้งหมด
        self.current_display_list = sorted(list(all_units), key=self.sort_key)

        # เพิ่มเข้าไปใน Listbox พร้อมเช็คสถานะ
        for unit in self.current_display_list:
            if unit in self.units:
                self.listbox.insert(tk.END, f"  {unit}        ✅")
                self.listbox.itemconfig(tk.END, {'fg': '#008000'}) # สีเขียว
            else:
                self.listbox.insert(tk.END, f"  {unit}        ❌")
                self.listbox.itemconfig(tk.END, {'fg': '#B22222'}) # สีแดง

    def get_selected_unit(self):
        selection = self.listbox.curselection()
        if not selection:
            return None
        idx = selection[0]
        # อ้างอิงจากลิสต์ที่เราเรียงไว้แล้วโดยตรง จะแม่นยำกว่าการตัดข้อความ
        return self.current_display_list[idx]

    def add_unit(self):
        raw_input = self.entry_var.get().strip()
        if not raw_input:
            self.entry.focus_set() # ทำให้เคอร์เซอร์กลับมาอยู่ที่ช่องกรอกเสมอ
            return

        # ถ้าเผลอพิมพ์ 42/ มาด้วย ให้เอาออกก่อน
        if raw_input.startswith(PREFIX):
            raw_input = raw_input[len(PREFIX):]

        # ถ้ากรอกมาแค่เลข 1 ให้แปลงเป็น 001 อัตโนมัติ (Padding)
        if raw_input.isdigit():
            raw_input = f"{int(raw_input):03d}"

        full_unit = f"{PREFIX}{raw_input}"

        if full_unit in self.units:
            self.status_var.set(f"⚠️ ซ้ำ! ห้อง '{full_unit}' ถูกคีย์ไปแล้ว")
            self.status_label.config(foreground="red")
            self.entry.selection_range(0, tk.END)
        else:
            self.units.add(full_unit)
            save_units(self.units)

            self.status_var.set(f"✅ บันทึก '{full_unit}' สำเร็จ!")
            self.status_label.config(foreground="green")

            self.entry_var.set("") # ล้างช่องกรอก
            self.update_ui()

            # เลื่อนรายชื่อไปโฟกัสที่ห้องที่เพิ่งเพิ่มเข้ามา
            try:
                idx = self.current_display_list.index(full_unit)
                self.listbox.see(idx)
                self.listbox.selection_clear(0, tk.END)
                self.listbox.selection_set(idx)
            except ValueError:
                pass

        # สำคัญมาก: ดึงโฟกัสกลับมาที่ textbox ทันทีหลังกด enter
        self.entry.focus_set()

    def delete_selected(self):
        selected = self.get_selected_unit()
        if not selected:
            messagebox.showwarning("เตือน", "กรุณาคลิกเลือกรายการห้องในช่องด้านบน ก่อนกดปุ่มครับ")
            self.entry.focus_set()
            return

        if selected not in self.units:
            messagebox.showwarning("เตือน", f"ห้อง '{selected}' ยังไม่ได้ถูกคีย์ (ยังเป็นกากบาทอยู่) ไม่จำเป็นต้องลบครับ")
            self.entry.focus_set()
            return

        # ยืนยันการลบ (ยกเลิกการคีย์)
        if messagebox.askyesno("ยืนยัน", f"คุณต้องการเปลี่ยนห้อง '{selected}' กลับไปเป็นสถานะ ❌ (ยังไม่คีย์) ใช่หรือไม่?"):
            self.units.remove(selected)
            save_units(self.units)

            self.status_var.set(f"🗑️ ยกเลิกการคีย์ห้อง '{selected}' แล้ว")
            self.status_label.config(foreground="#E91E63") # Pink/Red
            self.update_ui()

            try:
                idx = self.current_display_list.index(selected)
                self.listbox.see(idx)
                self.listbox.selection_clear(0, tk.END)
                self.listbox.selection_set(idx)
            except ValueError:
                pass

        self.entry.focus_set()

    def edit_selected(self):
        selected = self.get_selected_unit()
        if not selected:
            messagebox.showwarning("เตือน", "กรุณาคลิกเลือกรายการห้องในช่องด้านบน ก่อนกดแก้ไขครับ")
            self.entry.focus_set()
            return

        if selected not in self.units:
            messagebox.showwarning("เตือน", f"ห้อง '{selected}' ยังไม่ได้คีย์ หากต้องการคีย์ห้องนี้ ให้พิมพ์เลขในช่องแล้วกด Enter ได้เลยครับ")
            self.entry.focus_set()
            return

        # ดึงเฉพาะตัวเลขหลัง 42/ มาเป็นค่าเริ่มต้นให้แก้ไข
        old_num = selected
        if selected.startswith(PREFIX):
            old_num = selected[len(PREFIX):]

        # เด้งหน้าต่างให้พิมพ์ค่าใหม่
        new_num = simpledialog.askstring("แก้ไขรายการ", f"เปลี่ยนหมายเลขห้อง (โปรแกรมจะเติม {PREFIX} ให้อัตโนมัติ):",
                                         initialvalue=old_num, parent=self)

        if new_num is not None: # ถ้ากด OK (ไม่ใช่ Cancel)
            new_num = new_num.strip()
            if not new_num:
                self.entry.focus_set()
                return

            if new_num.startswith(PREFIX):
                new_num = new_num[len(PREFIX):]

            if new_num.isdigit():
                new_num = f"{int(new_num):03d}"

            full_new_unit = f"{PREFIX}{new_num}"

            if full_new_unit == selected:
                self.entry.focus_set()
                return # ไม่ได้เปลี่ยนอะไร

            if full_new_unit in self.units:
                messagebox.showerror("ข้อผิดพลาด", f"ห้อง '{full_new_unit}' ถูกคีย์ไปแล้ว! ไม่สามารถแก้ไขให้ซ้ำได้")
                self.entry.focus_set()
                return

            # ลบของเก่าออก และใส่ของใหม่เข้าไปแทน
            self.units.remove(selected)
            self.units.add(full_new_unit)
            save_units(self.units)

            self.status_var.set(f"✏️ แก้ไขห้องจาก '{selected}' เป็น '{full_new_unit}' เรียบร้อย")
            self.status_label.config(foreground="#2196F3") # Blue
            self.update_ui()

            # โฟกัสรายการใหม่ที่เพิ่งแก้
            try:
                idx = self.current_display_list.index(full_new_unit)
                self.listbox.see(idx)
                self.listbox.selection_clear(0, tk.END)
                self.listbox.selection_set(idx)
            except ValueError:
                pass

        self.entry.focus_set()

if __name__ == "__main__":
    app = UnitTrackerApp()
    app.mainloop()
