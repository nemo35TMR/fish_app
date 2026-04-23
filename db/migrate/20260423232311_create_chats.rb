class CreateChats < ActiveRecord::Migration[8.1]
  def change
    create_table :chats do |t|
      t.references :user, null: false, foreign_key: true
      t.references :lake, null: false, foreign_key: true
      t.string :title
      t.boolean :favorite

      t.timestamps
    end
  end
end
