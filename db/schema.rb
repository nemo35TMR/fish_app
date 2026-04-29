# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.1].define(version: 2026_04_29_011139) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "pg_catalog.plpgsql"

  create_table "chats", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.boolean "favorite"
    t.bigint "lake_id", null: false
    t.string "title"
    t.datetime "updated_at", null: false
    t.bigint "user_id", null: false
    t.index ["lake_id"], name: "index_chats_on_lake_id"
    t.index ["user_id"], name: "index_chats_on_user_id"
  end

  create_table "fish_lures", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.bigint "fish_species_id", null: false
    t.bigint "lure_id", null: false
    t.datetime "updated_at", null: false
    t.index ["fish_species_id"], name: "index_fish_lures_on_fish_species_id"
    t.index ["lure_id"], name: "index_fish_lures_on_lure_id"
  end

  create_table "fish_species", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "name"
    t.datetime "updated_at", null: false
  end

  create_table "lake_fishes", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.bigint "fish_species_id", null: false
    t.bigint "lake_id", null: false
    t.datetime "updated_at", null: false
    t.index ["fish_species_id"], name: "index_lake_fishes_on_fish_species_id"
    t.index ["lake_id"], name: "index_lake_fishes_on_lake_id"
  end

  create_table "lakes", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.text "description"
    t.decimal "latitude", precision: 10, scale: 7
    t.string "location"
    t.decimal "longitude", precision: 10, scale: 7
    t.string "name"
    t.datetime "updated_at", null: false
  end

  create_table "lures", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.text "description"
    t.string "name"
    t.datetime "updated_at", null: false
  end

  create_table "messages", force: :cascade do |t|
    t.bigint "chat_id", null: false
    t.text "content"
    t.datetime "created_at", null: false
    t.string "role"
    t.datetime "updated_at", null: false
    t.index ["chat_id"], name: "index_messages_on_chat_id"
  end

  create_table "solid_cable_messages", force: :cascade do |t|
    t.binary "channel", null: false
    t.bigint "channel_hash", null: false
    t.datetime "created_at", null: false
    t.binary "payload", null: false
    t.index ["channel"], name: "index_solid_cable_messages_on_channel"
    t.index ["channel_hash"], name: "index_solid_cable_messages_on_channel_hash"
    t.index ["created_at"], name: "index_solid_cable_messages_on_created_at"
  end

  create_table "users", force: :cascade do |t|
    t.datetime "confirmation_sent_at"
    t.string "confirmation_token"
    t.datetime "confirmed_at"
    t.datetime "created_at", null: false
    t.datetime "current_sign_in_at"
    t.string "current_sign_in_ip"
    t.string "email", default: "", null: false
    t.string "encrypted_password", default: "", null: false
    t.datetime "last_sign_in_at"
    t.string "last_sign_in_ip"
    t.datetime "remember_created_at"
    t.datetime "reset_password_sent_at"
    t.string "reset_password_token"
    t.integer "sign_in_count", default: 0, null: false
    t.string "unconfirmed_email"
    t.datetime "updated_at", null: false
    t.index ["email"], name: "index_users_on_email", unique: true
    t.index ["reset_password_token"], name: "index_users_on_reset_password_token", unique: true
  end

  add_foreign_key "chats", "lakes"
  add_foreign_key "chats", "users"
  add_foreign_key "fish_lures", "fish_species", column: "fish_species_id"
  add_foreign_key "fish_lures", "lures"
  add_foreign_key "lake_fishes", "fish_species", column: "fish_species_id"
  add_foreign_key "lake_fishes", "lakes"
  add_foreign_key "messages", "chats"
end
