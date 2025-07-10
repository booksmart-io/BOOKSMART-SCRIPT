String getNameInitials(String firstName, String lastName) {
  if (firstName.isEmpty || lastName.isEmpty) return "??";
  return firstName[0] + lastName[0];
}
